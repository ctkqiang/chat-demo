import { create } from 'zustand'
import { translate } from '../../i18n/index.js'
import { ApiError } from '../api/client.js'
import { classifyApiError } from '../api/errors.js'
import { appendLiveCall, useChatStore } from '../chat/store.js'
import { useSettings } from '../settings.js'
import { showToast } from '../../components/base/toastState.js'
import { stopReadAloud } from '../speech/readAloud.js'
import {
  ENABLE_INTERIM_CAPTIONS,
  LEVEL_FULL_RMS,
  MIC_FRAME_MS,
  MIC_SAMPLE_RATE,
  LIVE_VOICE_VAD,
  SEGMENT_MAX_CHARS,
  SEGMENT_MIN_CHARS,
  liveVoiceSupported,
} from './config.js'
import { EnergyVad } from './audio/vad.js'
import { startCaptionRecognition, type CaptionRecognition } from './audio/captionRecognition.js'
import { startMicCapture, WORKLET_FRAME_MS, type MicCapture } from './audio/micCapture.js'
import { createPlaybackQueue, type PlaybackQueue } from './audio/playbackQueue.js'
import { transition, type LiveVoiceEvent } from './stateMachine.js'
import { SentenceChunker } from './tts/sentenceChunker.js'
import { SegmentAssembler } from './tts/segmentAssembler.js'
import {
  createLiveVoiceTransport,
  getRealtimeSpeechUrl,
} from './transport/RealtimeSpeechAdapter.js'
import type { LiveVoiceTransport } from './transport/LiveVoiceTransport.js'
import type { LiveCallTurn, LiveVoiceStatus } from './types.js'

type LiveVoiceStoreState = {
  status: LiveVoiceStatus

  error: string | null

  transcript: string

  level: number

  replyText: string

  interimTranscript: string
}

export const useLiveVoiceConversation = create<LiveVoiceStoreState>(() => ({
  status: 'idle',
  error: null,
  transcript: '',
  level: 0,
  replyText: '',
  interimTranscript: '',
}))

type LiveSession = {
  transport: LiveVoiceTransport
  mic: MicCapture
  queue: PlaybackQueue
  vad: EnergyVad
  chunker: SentenceChunker
  assembler: SegmentAssembler
  controller: AbortController

  sending: boolean

  pendingReplyEnd: boolean
  levelSum: number
  levelCount: number
  unsubscribeImporting: () => void

  caption: CaptionRecognition | null

  sessionId: string | null

  turns: LiveCallTurn[]

  recordedTurn: boolean
}

let live: LiveSession | null = null

const getStatus = () => useLiveVoiceConversation.getState().status

const dispatch = (event: LiveVoiceEvent) => {
  const status = transition(getStatus(), event)
  useLiveVoiceConversation.setState({ status })

  const captureInterim = status === 'listening' || status === 'interrupted'
  live?.caption?.setActive(captureInterim)
  if (!captureInterim && useLiveVoiceConversation.getState().interimTranscript) {
    useLiveVoiceConversation.setState({ interimTranscript: '' })
  }
}

const describeMicError = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return translate('voiceInputPermissionDenied')
    }
    if (error.name === 'NotFoundError') {
      return translate('voiceInputNoDevice')
    }
  }
  return translate('voiceInputFailed')
}

const describeSpeechError = (error: unknown): string => {
  if (error instanceof ApiError) {
    switch (classifyApiError(error)) {
      case 'unauthorized':
        return translate('apiKeyInvalidRetry')
      case 'insufficientBalance':
        return translate('insufficientBalance')
      case 'rateLimited':
        return translate('rateLimited')
      default:
        break
    }
  }
  return translate('voiceInputFailed')
}

const teardown = (session: LiveSession) => {
  session.unsubscribeImporting()
  session.transport.dispose()
  session.controller.abort()
  session.queue.stop()
  session.mic.stop()
  session.caption?.stop()

  const state = useLiveVoiceConversation.getState()
  if (!session.recordedTurn && state.transcript.trim() && state.replyText.trim()) {
    session.turns.push({
      question: state.transcript.trim(),
      answer: state.replyText.trim(),
      status: 'stopped',
    })
  }
  appendLiveCall(session.sessionId, session.turns)
}

const failWith = (message: string) => {
  const session = live
  live = null
  if (session) {
    teardown(session)
  }
  useLiveVoiceConversation.setState({
    status: 'error',
    error: message,
    level: 0,
    replyText: '',
    interimTranscript: '',
  })
}

const bargeIn = (session: LiveSession) => {
  session.queue.stop()
  session.transport.cancel()
  session.chunker.reset()
  session.assembler.reset()
  session.pendingReplyEnd = false
  useLiveVoiceConversation.setState({ replyText: '' })
  dispatch('BARGE_IN')
}

const maybeFinishReply = () => {
  if (!live || !live.pendingReplyEnd) {
    return
  }
  const status = getStatus()
  if ((status === 'speaking' || status === 'thinking') && live.queue.isEmpty()) {
    dispatch('REPLY_END')
  }
}

const handleUtterance = async (session: LiveSession) => {
  const status = getStatus()
  if (status !== 'listening' && status !== 'interrupted') {
    return
  }
  const samples = session.mic.takeSamples()
  if (session.sending) {
    return
  }
  session.sending = true
  let text = ''
  try {
    text = await session.transport.recognize(samples, MIC_SAMPLE_RATE, session.controller.signal)
  } catch (error) {
    if (live === session && !session.controller.signal.aborted) {
      failWith(describeSpeechError(error))
    }
    return
  } finally {
    if (live === session) {
      session.sending = false
    }
  }
  if (live !== session) {
    return
  }
  text = text.trim()
  if (!text) {
    showToast({ key: 'voiceInputEmpty' })
    if (getStatus() === 'interrupted') {
      dispatch('BARGE_CANCEL')
    }
    return
  }
  useLiveVoiceConversation.setState({ transcript: text })

  session.recordedTurn = false
  dispatch(status === 'interrupted' ? 'BARGE_ACCEPT' : 'UTTERANCE')
  let sent = false
  try {
    sent = await session.transport.send(text)
  } catch (error) {
    if (live === session) {
      failWith(describeSpeechError(error))
    }
    return
  }
  if (live === session && !sent) {
    failWith(translate('voiceInputFailed'))
  }
}

const onLevel = (session: LiveSession, rms: number) => {
  session.levelSum += rms
  session.levelCount += 1
  if (session.levelCount * WORKLET_FRAME_MS < MIC_FRAME_MS) {
    return
  }
  const average = session.levelSum / session.levelCount
  session.levelSum = 0
  session.levelCount = 0

  const store = useLiveVoiceConversation.getState()
  if (store.status === 'listening') {
    const quantized = Math.round(Math.min(1, average / LEVEL_FULL_RMS) * 24) / 24
    if (quantized !== store.level) {
      useLiveVoiceConversation.setState({ level: quantized })
    }
  }
  const now = performance.now()
  for (const event of session.vad.feedLevel(average, MIC_FRAME_MS, now)) {
    if (event.type === 'speech-start') {
      session.mic.clear()
      const status = getStatus()
      if (!session.sending && (status === 'speaking' || status === 'thinking')) {
        bargeIn(session)
      }
    } else {
      void handleUtterance(session)
    }
  }
}

export const startLiveVoice = async () => {
  if (live) {
    return
  }
  if (!liveVoiceSupported()) {
    useLiveVoiceConversation.setState({
      status: 'error',
      level: 0,
      error: translate('liveVoiceNotSupported'),
    })
    return
  }
  let transport: LiveVoiceTransport
  try {
    transport = createLiveVoiceTransport()
  } catch {
    useLiveVoiceConversation.setState({
      status: 'error',
      level: 0,
      error: translate(
        getRealtimeSpeechUrl() ? 'liveVoiceRealtimeNotImplemented' : 'liveVoiceError'
      ),
    })
    return
  }

  stopReadAloud()

  const controller = new AbortController()
  const chunker = new SentenceChunker()
  let holder: LiveSession | null = null

  const caption = ENABLE_INTERIM_CAPTIONS
    ? startCaptionRecognition(useSettings.getState().locale, (text) => {
        if (live === holder) {
          useLiveVoiceConversation.setState({ interimTranscript: text })
        }
      })
    : null
  const queue = createPlaybackQueue(
    (text, signal) => transport.synthesize(text, signal),
    () => {
      if (holder) {
        maybeFinishReply()
      }
    },
    (error) => {
      if (holder) {
        failWith(describeSpeechError(error))
      }
    }
  )
  const assembler = new SegmentAssembler(
    (text) => queue.push(text),
    SEGMENT_MIN_CHARS,
    SEGMENT_MAX_CHARS
  )
  const vad = new EnergyVad(LIVE_VOICE_VAD)
  let mic: MicCapture
  try {
    mic = await startMicCapture({
      onLevel: (rms) => {
        if (holder) {
          onLevel(holder, rms)
        }
      },
    })
  } catch (error) {
    queue.stop()
    useLiveVoiceConversation.setState({ status: 'error', level: 0, error: describeMicError(error) })
    return
  }
  const unsubscribeImporting = useChatStore.subscribe((state) => {
    if (state.importingHistory) {
      stopLiveVoice()
    }
  })
  holder = {
    transport,
    mic,
    queue,
    vad,
    chunker,
    assembler,
    controller,
    sending: false,
    pendingReplyEnd: false,
    levelSum: 0,
    levelCount: 0,
    unsubscribeImporting,
    caption,
    sessionId: useChatStore.getState().activeId,
    turns: [],
    recordedTurn: false,
  }
  live = holder

  transport.onTextDelta = (delta) => {
    if (live !== holder) {
      return
    }

    const status = getStatus()
    if (status === 'interrupted') {
      return
    }
    if (status === 'listening' || status === 'thinking') {
      dispatch('REPLY_START')
      useLiveVoiceConversation.setState({ replyText: delta })
    } else {
      useLiveVoiceConversation.setState((state) => ({ replyText: state.replyText + delta }))
    }
    for (const chunk of chunker.feed(delta)) {
      assembler.push(chunk)
    }
  }
  transport.onReplyEnd = (info) => {
    if (live !== holder || getStatus() === 'interrupted') {
      return
    }
    for (const chunk of chunker.flush()) {
      assembler.push(chunk)
    }
    assembler.end()
    chunker.reset()
    if (info.status === 'error') {
      failWith(translate('liveVoiceReplyFailed'))
      return
    }

    const state = useLiveVoiceConversation.getState()
    if (state.transcript.trim() && state.replyText.trim()) {
      holder.turns.push({
        question: state.transcript.trim(),
        answer: state.replyText.trim(),
        status: info.status,
      })
      holder.recordedTurn = true
    }
    holder.pendingReplyEnd = true
    maybeFinishReply()
  }
  dispatch('START')
}

export const stopLiveVoice = () => {
  const session = live
  live = null
  if (session) {
    teardown(session)
  }
  useLiveVoiceConversation.setState({
    status: 'idle',
    error: null,
    transcript: '',
    level: 0,
    replyText: '',
    interimTranscript: '',
  })
}

export const toggleLiveVoice = () => {
  if (live) {
    stopLiveVoice()
  } else {
    void startLiveVoice()
  }
}

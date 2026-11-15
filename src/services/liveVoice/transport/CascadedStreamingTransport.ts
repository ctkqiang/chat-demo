import { streamMessage } from '../../api/client.js'
import { transcribe, synthesize } from '../../api/speech.js'
import type { MessageParam } from '../../api/types.js'
import { getVisibleMessages } from '../../chat/branches.js'
import { createLatestReminder } from '../../chat/latestReminder.js'
import {
  applyEvent,
  getContextRounds,
  getReplyText,
  toAssistantParam,
  toUserParam,
} from '../../chat/reply.js'
import { MODEL, SAFETY_CHECK, SYSTEM_PROMPT, serverTools, useChatStore } from '../../chat/store.js'
import type { AssistantMessage } from '../../chat/types.js'
import { createId } from '../../../utils/id.js'
import { useSettings } from '../../settings.js'
import { encodeWav } from '../audio/wav.js'
import type { LiveVoiceTransport, ReplyEndInfo } from './LiveVoiceTransport.js'

export const createCascadedTransport = (): LiveVoiceTransport => {
  let disposed = false

  const history: MessageParam[] = seedHistory()
  let lastReminder = ''
  let turn = 0
  let controller: AbortController | null = null
  let onTextDelta: ((delta: string) => void) | undefined
  let onReplyEnd: ((info: ReplyEndInfo) => void) | undefined

  const runTurn = async (transcript: string, sequence: number) => {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal

    const settings = useSettings.getState()
    const reminder = createLatestReminder(settings)
    if (reminder && reminder !== lastReminder) {
      history.push({ role: 'latest_reminder', content: reminder })
      lastReminder = reminder
    }
    history.push({ role: 'user', content: transcript })
    const reply: AssistantMessage = {
      id: createId(),
      role: 'assistant',
      createdAt: Date.now(),
      model: MODEL,
      thinking: settings.thinking,
      search: settings.search,
      prefix: true,
      status: 'pending',
      blocks: [],
    }
    let current = reply
    let consumed = 0
    try {
      const events = streamMessage(
        settings.apiKey ?? '',
        {
          model: MODEL,
          system: SYSTEM_PROMPT,
          messages: history,
          thinking: { type: settings.thinking ? 'enabled' : 'disabled' },
          safety_check: SAFETY_CHECK,
          tools: serverTools(settings.search),
        },
        signal
      )
      const blockIndexes = new Map<number, number>()
      for await (const event of events) {
        if (disposed || sequence !== turn) {
          return
        }
        current = applyEvent(current, event, Date.now(), blockIndexes)
        const text = getReplyText(current)
        if (text.length > consumed) {
          onTextDelta?.(text.slice(consumed))
          consumed = text.length
        }
      }
      const finalText = getReplyText(current)
      if (finalText.trim()) {
        history.push({ role: 'assistant', content: [{ type: 'text', text: finalText }] })
      }
      if (sequence === turn && !disposed) {
        onReplyEnd?.({ status: 'done' })
      }
    } catch {
      if (disposed || sequence !== turn) {
        return
      }
      if (signal.aborted) {
        const partial = getReplyText(current)
        if (partial.trim()) {
          history.push({ role: 'assistant', content: [{ type: 'text', text: partial }] })
        }
        onReplyEnd?.({ status: 'stopped' })
        return
      }
      onReplyEnd?.({ status: 'error' })
    }
  }

  function seedHistory(): MessageParam[] {
    const state = useChatStore.getState()
    const session =
      state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
        ? state.sessionCache[state.activeId]
        : undefined
    if (!session) {
      return []
    }
    return getContextRounds(getVisibleMessages(session)).flatMap(([user, reply]) => [
      toUserParam(user),
      toAssistantParam(reply),
    ])
  }

  return {
    recognize: (samples, sampleRate, signal) =>
      transcribe(useSettings.getState().apiKey ?? '', encodeWav(samples, sampleRate), signal),

    synthesize: (text, signal) =>
      synthesize(
        useSettings.getState().apiKey ?? '',
        text,
        useSettings.getState().ttsVoice,
        signal
      ),

    send: (transcript) => {
      if (disposed) {
        return Promise.resolve(false)
      }
      const sequence = ++turn
      void runTurn(transcript, sequence)
      return Promise.resolve(true)
    },

    cancel() {
      controller?.abort()
    },

    dispose() {
      disposed = true
      controller?.abort()
    },

    set onTextDelta(callback: ((delta: string) => void) | undefined) {
      onTextDelta = callback
    },
    set onReplyEnd(
      callback: ((info: { status: 'done' | 'stopped' | 'error' }) => void) | undefined
    ) {
      onReplyEnd = callback
    },
  }
}

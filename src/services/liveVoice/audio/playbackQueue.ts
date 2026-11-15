import { TTS_SAMPLE_RATE } from '../../api/speech.js'

export type PlaybackQueue = {
  push(text: string): void

  stop(): void

  isEmpty(): boolean
}

const START_DELAY = 0.1

const SEGMENT_GAP = 0.05

type Lookahead = {
  text: string
  stream: ReadableStream<Uint8Array> | null
  error: unknown
  promise: Promise<void>
}

const toFloat32 = (bytes: Uint8Array) => {
  const samples = new Float32Array(bytes.length >> 1)
  const view = new DataView(bytes.buffer, bytes.byteOffset, samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return samples
}

export const createPlaybackQueue = (
  ttsRequest: (text: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>,
  onEnded: () => void,
  onError: (error: unknown) => void
): PlaybackQueue => {
  const context = new AudioContext({ sampleRate: TTS_SAMPLE_RATE })
  const controller = new AbortController()
  const pending: string[] = []
  const sources = new Set<AudioBufferSourceNode>()
  let active = false
  let stopped = false
  let playing = false
  let nextTime = 0
  let lastSource: AudioBufferSourceNode | null = null
  let lookahead: Lookahead | null = null

  if (context.state === 'suspended') {
    void context.resume().catch(() => {})
  }

  const requestLookahead = () => {
    if (lookahead || pending.length === 0) {
      return
    }
    const text = pending[0]
    const entry: Lookahead = { text, stream: null, error: null, promise: Promise.resolve() }

    entry.promise = ttsRequest(text, controller.signal).then(
      (stream) => {
        entry.stream = stream
      },
      (error) => {
        entry.error = error
      }
    )
    lookahead = entry
  }

  const schedule = async (text: string) => {
    const entry = lookahead?.text === text ? lookahead : null
    lookahead = null
    let stream: ReadableStream<Uint8Array>
    if (entry) {
      await entry.promise
      if (entry.error !== null) {
        throw entry.error
      }
      stream = entry.stream ?? new ReadableStream<Uint8Array>()
    } else {
      stream = await ttsRequest(text, controller.signal)
    }
    const reader = stream.getReader()
    controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}))
    let rest = new Uint8Array(0)
    for (;;) {
      if (stopped) {
        return
      }
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      const bytes = new Uint8Array(rest.length + value.length)
      bytes.set(rest)
      bytes.set(value, rest.length)
      const samples = toFloat32(bytes)
      rest = bytes.slice(samples.length * 2)
      if (samples.length === 0) {
        continue
      }
      const buffer = context.createBuffer(1, samples.length, TTS_SAMPLE_RATE)
      buffer.copyToChannel(samples, 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)

      nextTime = Math.max(nextTime, context.currentTime + (playing ? SEGMENT_GAP : START_DELAY))
      source.start(nextTime)
      nextTime += buffer.duration
      sources.add(source)
      lastSource = source
      playing = true
      source.onended = () => {
        sources.delete(source)

        if (source === lastSource) {
          playing = false
          if (!stopped && !active && pending.length === 0) {
            onEnded()
          }
        }
      }

      requestLookahead()
    }
  }

  const pump = async () => {
    if (active || stopped) {
      return
    }
    const text = pending.shift()
    if (text === undefined) {
      return
    }
    active = true
    try {
      await schedule(text)
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onError(error)
      }
    } finally {
      active = false
      if (!stopped && pending.length > 0) {
        void pump()
      } else if (!stopped && pending.length === 0 && !playing) {
        onEnded()
      }
    }
  }

  return {
    push(text) {
      if (stopped) {
        return
      }
      pending.push(text)
      requestLookahead()
      void pump()
    },
    stop() {
      if (stopped) {
        return
      }
      stopped = true
      controller.abort()
      for (const source of sources) {
        try {
          source.stop()
        } catch {
          void 0
        }
      }
      sources.clear()
      void context.close().catch(() => {})
    },
    isEmpty() {
      return pending.length === 0 && !active && !playing
    },
  }
}

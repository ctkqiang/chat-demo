import { MIC_SAMPLE_RATE, WORKLET_FRAME_SAMPLES } from '../config.js'

type WorkletMessage =
  | { type: 'level'; rms: number }
  | { type: 'samples'; samples: Float32Array }
  | { type: 'set-recording'; value: boolean }

const WORKLET_SOURCE = `
class LiveMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recording = false
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'set-recording') {
        this.recording = event.data.value
      }
    }
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      let sum = 0
      for (let i = 0; i < channel.length; i++) {
        const sample = channel[i]
        sum += sample * sample
      }
      this.port.postMessage({ type: 'level', rms: Math.sqrt(sum / channel.length) })
      if (this.recording) {
        this.port.postMessage({ type: 'samples', samples: new Float32Array(channel) })
      }
    }
    return true
  }
}
registerProcessor('live-mic-processor', LiveMicProcessor)
`

export type MicCaptureOptions = {
  onLevel?: (rms: number) => void
}

export type MicCapture = {
  clear(): void

  takeSamples(): Float32Array

  stop(): void
}

export const startMicCapture = async (options: MicCaptureOptions = {}): Promise<MicCapture> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let node: AudioWorkletNode | undefined
  let workletUrl: string | undefined
  const chunks: Float32Array[] = []
  let length = 0
  let recording = false
  let released = false

  const setRecording = (value: boolean) => {
    recording = value
    node?.port.postMessage({ type: 'set-recording', value })
  }

  const release = () => {
    if (released) {
      return
    }
    released = true
    setRecording(false)
    for (const item of [node, source]) {
      try {
        item?.disconnect()
      } catch {
        void 0
      }
    }
    for (const track of stream.getTracks()) {
      track.stop()
    }
    if (workletUrl) {
      URL.revokeObjectURL(workletUrl)
      workletUrl = undefined
    }
    void context?.close().catch(() => {})
  }

  try {
    context = new AudioContext({ sampleRate: MIC_SAMPLE_RATE })
    workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
    await context.audioWorklet.addModule(workletUrl)
    source = context.createMediaStreamSource(stream)
    node = new AudioWorkletNode(context, 'live-mic-processor')
    node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const data = event.data
      if (data.type === 'level') {
        options.onLevel?.(data.rms)
      } else if (data.type === 'samples' && recording && !released) {
        chunks.push(data.samples)
        length += data.samples.length
      }
    }
    source.connect(node)

    node.connect(context.destination)

    if (context.state === 'suspended') {
      void context.resume().catch(() => {})
    }

    return {
      clear() {
        chunks.length = 0
        length = 0
        setRecording(true)
      },
      takeSamples() {
        setRecording(false)
        const samples = new Float32Array(length)
        let offset = 0
        for (const chunk of chunks) {
          samples.set(chunk, offset)
          offset += chunk.length
        }
        chunks.length = 0
        length = 0
        return samples
      },
      stop: release,
    }
  } catch (error) {
    release()
    throw error
  }
}

export const WORKLET_FRAME_MS = (WORKLET_FRAME_SAMPLES / MIC_SAMPLE_RATE) * 1000

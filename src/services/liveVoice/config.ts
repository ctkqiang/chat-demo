export const MIC_SAMPLE_RATE = 16000

export const WORKLET_FRAME_SAMPLES = 128

export const MIC_FRAME_MS = 32

export const LIVE_VOICE_VAD = {
  onsetRms: 0.02,

  offsetRms: 0.012,

  minSpeechMs: 250,

  minSilenceMs: 700,

  maxUtteranceMs: 30000,
} as const

export const LEVEL_FULL_RMS = 0.12

export const ENABLE_INTERIM_CAPTIONS = true

export const SEGMENT_MIN_CHARS = 120

export const SEGMENT_MAX_CHARS = 500

export const liveVoiceSupported = (): boolean =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof AudioContext !== 'undefined' &&
  'audioWorklet' in AudioContext.prototype &&
  typeof navigator.mediaDevices?.getUserMedia === 'function'

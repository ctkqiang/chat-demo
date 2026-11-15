import type { LiveVoiceTransport } from './LiveVoiceTransport.js'
import { createCascadedTransport } from './CascadedStreamingTransport.js'

export const createRealtimeSpeechAdapter = (url: string): LiveVoiceTransport => {
  throw new Error(`Realtime speech adapter is not implemented (configured url: ${url})`)
}

export const getRealtimeSpeechUrl = (): string =>
  typeof __LIVE_VOICE_REALTIME_URL__ === 'string' ? __LIVE_VOICE_REALTIME_URL__.trim() : ''

export const createLiveVoiceTransport = (): LiveVoiceTransport => {
  const url = getRealtimeSpeechUrl()
  return url ? createRealtimeSpeechAdapter(url) : createCascadedTransport()
}

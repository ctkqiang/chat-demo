export type VadEvent =
  | { type: 'speech-start' }
  | { type: 'speech-end'; durationMs: number }
  | { type: 'max-duration'; durationMs: number }

export type EnergyVadConfig = {
  onsetRms: number

  offsetRms: number

  minSpeechMs: number

  minSilenceMs: number

  maxUtteranceMs: number
}

export class EnergyVad {
  private speaking = false
  private speechStartAt = -1
  private lastSpeechAt = -1
  private speechDuration = 0
  private silenceDuration = 0
  private readonly config: EnergyVadConfig

  constructor(config: EnergyVadConfig) {
    this.config = config
  }

  feedLevel(rms: number, durationMs: number, now: number): VadEvent[] {
    const threshold = this.speaking ? this.config.offsetRms : this.config.onsetRms
    if (!this.speaking) {
      if (rms < threshold) {
        return []
      }
      this.speaking = true
      this.speechStartAt = now
      this.lastSpeechAt = now
      this.speechDuration = 0
      this.silenceDuration = 0
      return [{ type: 'speech-start' }]
    }
    if (rms >= threshold) {
      this.lastSpeechAt = now
      this.speechDuration += durationMs
      this.silenceDuration = 0
      if (this.speechDuration >= this.config.maxUtteranceMs) {
        this.speaking = false
        return [{ type: 'max-duration', durationMs: this.speechDuration }]
      }
      return []
    }
    this.silenceDuration += durationMs
    if (this.silenceDuration < this.config.minSilenceMs) {
      return []
    }
    this.speaking = false
    const spokenMs = Math.max(0, this.lastSpeechAt - this.speechStartAt)

    return spokenMs >= this.config.minSpeechMs ? [{ type: 'speech-end', durationMs: spokenMs }] : []
  }

  reset() {
    this.speaking = false
    this.speechStartAt = -1
    this.lastSpeechAt = -1
    this.speechDuration = 0
    this.silenceDuration = 0
  }
}

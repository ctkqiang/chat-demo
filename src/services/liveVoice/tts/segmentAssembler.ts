const SEGMENT_SEPARATORS = '。！？…!?.;；'

export class SegmentAssembler {
  private buffer = ''
  private emitted = false
  private readonly onSegment: (text: string) => void
  private readonly minChars: number
  private readonly maxChars: number

  constructor(onSegment: (text: string) => void, minChars: number, maxChars: number) {
    this.onSegment = onSegment
    this.minChars = minChars
    this.maxChars = maxChars
  }

  push(chunk: string) {
    this.buffer += chunk
    for (;;) {
      const boundary = this.lastBoundary()

      if (!this.emitted && boundary >= 0) {
        this.emit(this.buffer.slice(0, boundary + 1))
        continue
      }
      if (boundary >= this.minChars) {
        this.emit(this.buffer.slice(0, boundary + 1))
        continue
      }
      if (this.buffer.length > this.maxChars) {
        this.emit(this.buffer.slice(0, boundary >= 0 ? boundary + 1 : this.maxChars))
        continue
      }
      break
    }
  }

  end() {
    if (this.buffer) {
      this.emit(this.buffer)
    }
  }

  reset() {
    this.buffer = ''
    this.emitted = false
  }

  private lastBoundary(): number {
    const limit = Math.min(this.buffer.length, this.maxChars)
    for (let i = limit - 1; i >= 0; i--) {
      if (SEGMENT_SEPARATORS.includes(this.buffer[i])) {
        return i
      }
    }
    return -1
  }

  private emit(text: string) {
    this.onSegment(text)
    this.buffer = this.buffer.slice(text.length)
    this.emitted = true
  }
}

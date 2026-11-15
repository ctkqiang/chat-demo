export type ReplyEndInfo = {
  status: 'done' | 'stopped' | 'error'
}

export type LiveVoiceTransport = {
  recognize(samples: Float32Array, sampleRate: number, signal: AbortSignal): Promise<string>

  synthesize(text: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>

  send(transcript: string): Promise<boolean>

  cancel(): void

  dispose(): void

  onTextDelta?: (delta: string) => void

  onReplyEnd?: (info: ReplyEndInfo) => void
}

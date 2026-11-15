export type LiveVoiceStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'error'

export type LiveCallTurn = {
  question: string
  answer: string

  status: 'done' | 'stopped'
}

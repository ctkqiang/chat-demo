import type { LiveVoiceStatus } from './types.js'

export type LiveVoiceEvent =
  | 'START'
  | 'UTTERANCE'
  | 'REPLY_START'
  | 'REPLY_END'
  | 'BARGE_IN'
  | 'BARGE_ACCEPT'
  | 'BARGE_CANCEL'
  | 'FAIL'
  | 'STOP'

const TRANSITIONS: Record<LiveVoiceStatus, Partial<Record<LiveVoiceEvent, LiveVoiceStatus>>> = {
  idle: { START: 'listening', STOP: 'idle' },
  listening: { UTTERANCE: 'thinking', REPLY_START: 'speaking', FAIL: 'error', STOP: 'idle' },
  thinking: {
    REPLY_START: 'speaking',
    REPLY_END: 'listening',
    BARGE_IN: 'interrupted',
    FAIL: 'error',
    STOP: 'idle',
  },
  speaking: {
    REPLY_END: 'listening',
    BARGE_IN: 'interrupted',
    FAIL: 'error',
    STOP: 'idle',
  },
  interrupted: {
    BARGE_ACCEPT: 'thinking',
    BARGE_CANCEL: 'listening',
    FAIL: 'error',
    STOP: 'idle',
  },
  error: { STOP: 'idle' },
}

export const transition = (state: LiveVoiceStatus, event: LiveVoiceEvent): LiveVoiceStatus =>
  TRANSITIONS[state][event] ?? state

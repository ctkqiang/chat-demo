import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transition, type LiveVoiceEvent } from './stateMachine.ts'
import type { LiveVoiceStatus } from './types.ts'

const run = (start: LiveVoiceStatus, events: LiveVoiceEvent[]): LiveVoiceStatus =>
  events.reduce(transition, start)

test('正常会话流程：idle → listening → thinking → speaking → listening', () => {
  assert.equal(run('idle', ['START']), 'listening')
  assert.equal(run('idle', ['START', 'UTTERANCE']), 'thinking')
  assert.equal(run('idle', ['START', 'UTTERANCE', 'REPLY_START']), 'speaking')
  assert.equal(run('idle', ['START', 'UTTERANCE', 'REPLY_START', 'REPLY_END']), 'listening')
})

test('打断流程：speaking → interrupted → thinking → speaking', () => {
  assert.equal(run('speaking', ['BARGE_IN']), 'interrupted')
  assert.equal(run('speaking', ['BARGE_IN', 'BARGE_ACCEPT']), 'thinking')
  assert.equal(run('speaking', ['BARGE_IN', 'BARGE_ACCEPT', 'REPLY_START']), 'speaking')
})

test('打断后没有有效语音：interrupted → listening', () => {
  assert.equal(transition('interrupted', 'BARGE_CANCEL'), 'listening')
})

test('thinking 期间可打断、可结束（空回复）', () => {
  assert.equal(transition('thinking', 'BARGE_IN'), 'interrupted')
  assert.equal(transition('thinking', 'REPLY_END'), 'listening')
})

test('打字提问触发的回复：listening 直接进入 speaking', () => {
  assert.equal(transition('listening', 'REPLY_START'), 'speaking')
})

test('非法迁移保持原状态', () => {
  assert.equal(transition('idle', 'REPLY_END'), 'idle')
  assert.equal(transition('idle', 'BARGE_IN'), 'idle')
  assert.equal(transition('listening', 'REPLY_END'), 'listening')
  assert.equal(transition('error', 'START'), 'error')
  assert.equal(transition('error', 'UTTERANCE'), 'error')
})

test('任意状态 STOP 回到 idle', () => {
  for (const state of [
    'idle',
    'listening',
    'thinking',
    'speaking',
    'interrupted',
    'error',
  ] as const) {
    assert.equal(transition(state, 'STOP'), 'idle')
  }
})

test('出错后只能退出', () => {
  assert.equal(transition('listening', 'FAIL'), 'error')
  assert.equal(transition('speaking', 'FAIL'), 'error')
  assert.equal(transition('interrupted', 'FAIL'), 'error')
})

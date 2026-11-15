import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnergyVad, type VadEvent } from './vad.ts'

const config = {
  onsetRms: 0.02,
  offsetRms: 0.012,
  minSpeechMs: 250,
  minSilenceMs: 700,
  maxUtteranceMs: 30000,
}

test('静音不产生事件；超阈值触发 speech-start', () => {
  const vad = new EnergyVad(config)
  assert.deepEqual(vad.feedLevel(0.001, 100, 0), [])
  assert.deepEqual(vad.feedLevel(0.03, 100, 100), [{ type: 'speech-start' }])
})

test('持续说话后静音足够久产生 speech-end', () => {
  const vad = new EnergyVad(config)
  const events: VadEvent[] = []
  let now = 0
  for (let i = 0; i < 10; i++) {
    now += 100
    events.push(...vad.feedLevel(0.05, 100, now))
  }
  for (let i = 0; i < 8; i++) {
    now += 100
    events.push(...vad.feedLevel(0.005, 100, now))
  }
  assert.deepEqual(events, [{ type: 'speech-start' }, { type: 'speech-end', durationMs: 900 }])
})

test('短促噪音不产生 speech-end', () => {
  const vad = new EnergyVad(config)
  let now = 0
  const events: VadEvent[] = [...vad.feedLevel(0.05, 100, (now += 100))]
  for (let i = 0; i < 8; i++) {
    events.push(...vad.feedLevel(0.001, 100, (now += 100)))
  }
  assert.ok(events.some((event) => event.type === 'speech-start'))
  assert.ok(!events.some((event) => event.type === 'speech-end'))

  assert.deepEqual(vad.feedLevel(0.05, 100, (now += 100)), [{ type: 'speech-start' }])
})

test('达到时长上限强制结束', () => {
  const vad = new EnergyVad({ ...config, maxUtteranceMs: 1000 })
  const events: VadEvent[] = []
  let now = 0
  for (let i = 0; i < 12; i++) {
    events.push(...vad.feedLevel(0.05, 100, (now += 100)))
  }
  assert.ok(events.some((event) => event.type === 'max-duration'))
  assert.ok(!events.some((event) => event.type === 'speech-end'))
})

test('滞回：说话期间低于 onset 但高于 offset 不算静音', () => {
  const vad = new EnergyVad(config)
  let now = 0
  vad.feedLevel(0.05, 100, (now += 100))
  const events: VadEvent[] = []
  for (let i = 0; i < 5; i++) {
    events.push(...vad.feedLevel(0.015, 100, (now += 100)))
  }
  assert.deepEqual(events, [])
})

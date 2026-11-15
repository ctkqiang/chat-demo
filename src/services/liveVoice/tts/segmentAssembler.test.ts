import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SegmentAssembler } from './segmentAssembler.ts'

const collect = (minChars: number, maxChars: number, chunks: string[]) => {
  const segments: string[] = []
  const assembler = new SegmentAssembler((text) => segments.push(text), minChars, maxChars)
  chunks.forEach((chunk) => assembler.push(chunk))
  assembler.end()
  return segments
}

test('首句立即提交，之后攒够最小长度再截断', () => {
  assert.deepEqual(collect(6, 20, ['你好。', '今天天气不错。']), ['你好。', '今天天气不错。'])
})

test('首句立即提交，不等待攒批', () => {
  assert.deepEqual(collect(50, 200, ['你好。', '今天天气不错。']), ['你好。', '今天天气不错。'])
})

test('未攒够时 end 输出剩余文本', () => {
  assert.deepEqual(collect(6, 20, ['你好。']), ['你好。'])
})

test('超过最大长度且没有句读时硬切', () => {
  assert.deepEqual(collect(5, 8, ['一二三四五六七八九十']), ['一二三四五六七八', '九十'])
})

test('超过最大长度时优先在句读处断开', () => {
  assert.deepEqual(collect(4, 8, ['一二三。四五六七八。']), ['一二三。', '四五六七八。'])
})

test('reset 丢弃未提交的缓冲', () => {
  const segments: string[] = []
  const assembler = new SegmentAssembler((text) => segments.push(text), 6, 20)
  assembler.push('没有句读的')
  assembler.reset()
  assembler.end()
  assert.deepEqual(segments, [])
})

test('reset 后首句再次立即提交', () => {
  const segments: string[] = []
  const assembler = new SegmentAssembler((text) => segments.push(text), 6, 20)
  assembler.push('第一句。')
  assembler.reset()
  assembler.push('第二句。')
  assert.deepEqual(segments, ['第一句。', '第二句。'])
})

test('空输入不产生片段', () => {
  assert.deepEqual(collect(6, 20, []), [])
})

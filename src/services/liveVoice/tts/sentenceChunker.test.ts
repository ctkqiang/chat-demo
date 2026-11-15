import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SentenceChunker } from './sentenceChunker.ts'

test('按句读切分，增量边界不影响结果', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('你好。今天'), ['你好。'])
  assert.deepEqual(chunker.feed('天气不错！'), ['今天天气不错！'])
})

test('未闭合的链接不截断，闭合后再输出', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('详见[文档说明。'), [])
  assert.deepEqual(chunker.feed('](https://example.com) 到此为止。'), ['详见文档说明。到此为止。'])
})

test('代码块默认跳过', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('先看代码：\n```python\nprint("hi")\n```\n再看结论。'), [
    '先看代码：再看结论。',
  ])
})

test('代码块可配置朗读', () => {
  const chunker = new SentenceChunker({ readCodeBlocks: true })
  assert.deepEqual(chunker.feed('代码如下：\n```\nhello world\n```\n结束。'), [
    '代码如下： hello world 结束。',
  ])
})

test('代码块跨增量闭合', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('上面。\n```js\ncode('), ['上面。'])
  assert.deepEqual(chunker.feed(')\n```\n下面。'), ['下面。'])
})

test('数学公式默认跳过', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('公式 $$x^2+y^2$$ 如下。'), ['公式如下。'])
})

test('数学公式跨增量时等待闭合', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('公式 $$x^2。'), [])
  assert.deepEqual(chunker.feed('$$ 结束。'), ['公式结束。'])
})

test('链接默认只读文字', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('参考[文档](https://example.com)看看。'), ['参考文档看看。'])
})

test('链接可配置朗读地址', () => {
  const chunker = new SentenceChunker({ readLinkUrls: true })
  assert.deepEqual(chunker.feed('参考[文档](https://example.com)看看。'), [
    '参考文档 https://example.com看看。',
  ])
})

test('图片整段丢弃', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('看下图 ![示意](img.png) 然后继续。'), ['看下图然后继续。'])
})

test('标题、列表、引用标记被去掉', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('# 标题\n- 第一点\n> 引用内容。'), ['标题第一点引用内容。'])
})

test('表格分隔行删除、竖线变空格', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('| 名称 | 值 |\n| --- | --- |\n| 甲 | 1 | 结束。'), [
    '名称值 甲 1 结束。',
  ])
})

test('小数点不拆句', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('版本 3.14 发布。'), ['版本 3.14 发布。'])
})

test('省略号在末尾构成边界', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('然后...结束。'), ['然后...', '结束。'])
})

test('段落空行作为边界', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('第一段\n\n第二段'), ['第一段'])
  assert.deepEqual(chunker.feed('。'), ['第二段。'])
})

test('flush 输出剩余文本', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('没有句读的'), [])
  assert.deepEqual(chunker.flush(), ['没有句读的'])
})

test('reset 丢弃缓冲', () => {
  const chunker = new SentenceChunker()
  chunker.feed('半句话')
  chunker.reset()
  assert.deepEqual(chunker.flush(), [])
})

test('超长片段在标点处断开', () => {
  const chunker = new SentenceChunker({ maxChunkLength: 10 })
  assert.deepEqual(chunker.feed('一二三四五六，七八九十。'), ['一二三四五六，', '七八九十。'])
})

test('英文句读与行内代码', () => {
  const chunker = new SentenceChunker()
  assert.deepEqual(chunker.feed('Run `npm install` first. Then build.'), [
    'Run npm install first.',
    'Then build.',
  ])
})

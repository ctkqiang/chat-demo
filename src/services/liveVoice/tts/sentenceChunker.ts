export type SentenceChunkerOptions = {
  readCodeBlocks?: boolean

  readMath?: boolean

  readLinkUrls?: boolean

  maxChunkLength?: number
}

const DEFAULT_MAX_CHUNK = 500

const SENTENCE_END = '。！？…!?.;；'

const TRAILING_QUOTES = '"\'”』）」】'

export class SentenceChunker {
  private buffer = ''

  private inFence: { marker: string; contentStart: number } | null = null
  private readonly readCodeBlocks: boolean
  private readonly readMath: boolean
  private readonly readLinkUrls: boolean
  private readonly maxChunkLength: number

  constructor(options: SentenceChunkerOptions = {}) {
    this.readCodeBlocks = options.readCodeBlocks ?? false
    this.readMath = options.readMath ?? false
    this.readLinkUrls = options.readLinkUrls ?? false
    this.maxChunkLength = options.maxChunkLength ?? DEFAULT_MAX_CHUNK
  }

  feed(delta: string): string[] {
    this.buffer += delta
    const chunks: string[] = []
    for (;;) {
      if (this.inFence) {
        const close = findClosingFence(this.buffer, this.inFence.marker)
        if (close === null) {
          break
        }
        const inner = this.buffer.slice(this.inFence.contentStart, close.lineStart)
        this.buffer =
          this.buffer.slice(0, this.inFence.contentStart) +
          (this.readCodeBlocks ? inner : '') +
          this.buffer.slice(close.lineEnd)
        this.inFence = null
        continue
      }
      const open = findOpeningFence(this.buffer)
      if (open) {
        const emitted = this.emitReady(this.buffer.slice(0, open.lineStart))
        chunks.push(...emitted.chunks)
        this.inFence = { marker: open.marker, contentStart: emitted.rest.length }
        this.buffer = emitted.rest + this.buffer.slice(open.lineEnd)
        continue
      }
      const emitted = this.emitReady(this.buffer)
      chunks.push(...emitted.chunks)
      this.buffer = emitted.rest
      break
    }
    return chunks.filter((chunk) => chunk !== '')
  }

  flush(): string[] {
    const chunks: string[] = []
    if (!this.inFence || this.readCodeBlocks) {
      chunks.push(...splitLong(this.sanitize(this.buffer), this.maxChunkLength))
    }
    this.buffer = ''
    this.inFence = null
    return chunks.filter((chunk) => chunk !== '')
  }

  reset() {
    this.buffer = ''
    this.inFence = null
  }

  private emitReady(text: string): { chunks: string[]; rest: string } {
    const chunks: string[] = []
    let rest = text
    for (;;) {
      const boundaries = findSentenceBoundaries(rest)
      const end = boundaries.find((position) => !hasOpenConstruct(rest.slice(0, position)))
      if (end === undefined) {
        break
      }
      const chunk = this.sanitize(rest.slice(0, end))
      rest = rest.slice(end)
      if (chunk) {
        chunks.push(...splitLong(chunk, this.maxChunkLength))
      }
    }
    return { chunks, rest }
  }

  private sanitize(text: string): string {
    let out = text

    out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, '')

    out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_all, label: string, url: string) =>
      this.readLinkUrls && url ? `${label} ${url}` : label
    )
    if (!this.readMath) {
      out = out.replace(/\$\$[\s\S]*?\$\$/g, '')
      out = out.replace(/\\\([\s\S]*?\\\)/g, '')
    }

    out = out.replace(/^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm, '')

    out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    out = out.replace(/^[ \t]*>[ \t]?/gm, '')
    out = out.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '')

    out = out.replace(/\|/g, ' ')

    out = out.replace(/<[^>]*>/g, '')

    out = out.replace(/`([^`]*)`/g, '$1').replace(/`/g, '')

    out = out.replace(/\*\*|__|~~/g, '')

    out = out.replace(/\s+/g, ' ').trim()
    out = out.replace(/(\P{ASCII}) (\P{ASCII})/gu, '$1$2')

    out = out.replace(/ ([,.;:!?;；：，。！？…])/g, '$1')
    return out
  }
}

const findSentenceBoundaries = (text: string): number[] => {
  const ends: number[] = []
  const paragraph = /[ \t]*\n[ \t]*\n/g
  let match: RegExpExecArray | null
  while ((match = paragraph.exec(text))) {
    ends.push(match.index + match[0].length)
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (!SENTENCE_END.includes(char)) {
      continue
    }
    if (char === '.') {
      const previous = text[i - 1]
      const next = text[i + 1]

      if ((previous >= '0' && previous <= '9' && next >= '0' && next <= '9') || next === '.') {
        continue
      }
    }

    if (char === '!' && text[i + 1] === '[') {
      continue
    }
    let end = i + 1
    while (end < text.length && TRAILING_QUOTES.includes(text[end])) {
      end += 1
    }
    ends.push(end)
  }
  ends.sort((a, b) => a - b)
  return ends
}

const hasOpenConstruct = (text: string): boolean => {
  const plain = text.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\\\([\s\S]*?\\\)/g, '')
  if (countUnescaped(plain, '`') % 2 === 1) {
    return true
  }
  if (countOccurrences(plain, '$$') % 2 === 1) {
    return true
  }
  if (countUnescaped(plain, '[') > countUnescaped(plain, ']')) {
    return true
  }

  return /!?\[[^\]]*\]\([^)]*$/.test(plain)
}

const countUnescaped = (text: string, char: string): number => {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i += 1
      continue
    }
    if (text[i] === char) {
      count += 1
    }
  }
  return count
}

const countOccurrences = (text: string, pattern: string): number => {
  let count = 0
  let index = 0
  for (;;) {
    const found = text.indexOf(pattern, index)
    if (found === -1) {
      return count
    }
    count += 1
    index = found + pattern.length
  }
}

const findOpeningFence = (
  text: string
): { marker: string; lineStart: number; lineEnd: number } | null => {
  const headEnd = text.lastIndexOf('\n') + 1
  const match = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*$/m.exec(text.slice(0, headEnd))
  if (!match) {
    return null
  }

  return {
    marker: match[1],
    lineStart: match.index,
    lineEnd: match.index + match[0].length + 1,
  }
}

const findClosingFence = (
  text: string,
  marker: string
): { lineStart: number; lineEnd: number } | null => {
  const headEnd = text.lastIndexOf('\n') + 1
  const match = new RegExp(`^[ \\t]{0,3}${marker[0]}{3,}[ \\t]*$`, 'm').exec(text.slice(0, headEnd))
  if (!match) {
    return null
  }
  return { lineStart: match.index, lineEnd: match.index + match[0].length + 1 }
}

const splitLong = (chunk: string, maxLength: number): string[] => {
  if (chunk.length <= maxLength) {
    return [chunk]
  }
  const parts: string[] = []
  let rest = chunk
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength)
    let cut = -1
    for (const separator of '，,、;；:：') {
      cut = Math.max(cut, window.lastIndexOf(separator))
    }
    const end = cut >= maxLength / 2 ? cut + 1 : maxLength
    parts.push(rest.slice(0, end))
    rest = rest.slice(end)
  }
  if (rest) {
    parts.push(rest)
  }
  return parts
}

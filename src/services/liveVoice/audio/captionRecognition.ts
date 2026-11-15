type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ isFinal: boolean; transcript: string }>> }) => void)
    | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}

export type CaptionRecognition = {
  setActive(active: boolean): void

  stop(): void
}

const getRecognitionCtor = (): (new () => SpeechRecognitionLike) | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }
  const global = window as unknown as { SpeechRecognition?: unknown }
  return typeof global.SpeechRecognition === 'function'
    ? (global.SpeechRecognition as new () => SpeechRecognitionLike)
    : undefined
}

export const startCaptionRecognition = (
  locale: string,
  onInterim: (text: string) => void
): CaptionRecognition | null => {
  const Recognition = getRecognitionCtor()
  if (!Recognition) {
    return null
  }
  let recognition: SpeechRecognitionLike | null = null
  let active = false
  let stopped = false
  let restartTimer: ReturnType<typeof setTimeout> | undefined

  const create = () => {
    const instance = new Recognition()
    instance.lang = locale
    instance.continuous = true
    instance.interimResults = true
    instance.onresult = (event) => {
      const results = event.results
      const last = results[results.length - 1]
      const item = last?.[last.length - 1]
      if (item && !item.isFinal) {
        onInterim(item.transcript)
      }
    }
    instance.onend = () => {
      if (stopped || !active) {
        return
      }

      restartTimer = setTimeout(() => {
        if (stopped || !active) {
          return
        }
        try {
          recognition?.start()
        } catch {
          return
        }
      }, 150)
    }
    instance.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopped = true
      }
    }
    return instance
  }

  recognition = create()
  try {
    recognition.start()
  } catch {
    stopped = true
  }

  return {
    setActive(value) {
      active = value
      if (stopped) {
        return
      }
      try {
        if (value) {
          recognition?.start()
        } else {
          recognition?.stop()
        }
      } catch {
        return
      }
    },
    stop() {
      stopped = true
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = undefined
      }
      try {
        recognition?.stop()
      } catch {
        stopped = true
      }
      recognition = null
    },
  }
}

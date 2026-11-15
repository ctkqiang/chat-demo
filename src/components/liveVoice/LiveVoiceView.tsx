import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { IconCloseOutline16, IconWarningOutline16 } from '../base/icons.js'
import { stopLiveVoice, useLiveVoiceConversation } from '../../services/liveVoice/conversation.js'
import type { LiveVoiceStatus } from '../../services/liveVoice/types.js'
import { LiveVoiceRing, type LiveVoiceRingMode } from './LiveVoiceRing.js'
import styles from './LiveVoiceView.module.css'

const STATUS_LABELS: Record<Exclude<LiveVoiceStatus, 'idle'>, TranslationKey> = {
  listening: 'liveVoiceListening',
  thinking: 'liveVoiceThinking',
  speaking: 'liveVoiceSpeaking',
  interrupted: 'liveVoiceInterrupted',
  error: 'liveVoiceError',
}

const RING_MODES: Record<Exclude<LiveVoiceStatus, 'idle'>, LiveVoiceRingMode> = {
  listening: 'level',
  thinking: 'pulse',
  speaking: 'bounce',
  interrupted: 'static',
  error: 'static',
}

export const LiveVoiceView = () => {
  const t = useTranslate()
  const status = useLiveVoiceConversation((state) => state.status)
  const error = useLiveVoiceConversation((state) => state.error)
  const transcript = useLiveVoiceConversation((state) => state.transcript)
  const replyText = useLiveVoiceConversation((state) => state.replyText)
  const interimTranscript = useLiveVoiceConversation((state) => state.interimTranscript)
  const level = useLiveVoiceConversation((state) => state.level)
  const exitRef = useRef<HTMLButtonElement>(null)
  const captionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && useLiveVoiceConversation.getState().status !== 'idle') {
        stopLiveVoice()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const active = status !== 'idle'

  useEffect(() => {
    if (active) {
      exitRef.current?.focus({ preventScroll: true })
    }
  }, [active])

  useEffect(() => {
    const captions = captionsRef.current
    if (captions) {
      captions.scrollTop = captions.scrollHeight
    }
  }, [transcript, replyText])

  if (!active) {
    return null
  }
  const listening = status === 'listening'
  const showCaptions = Boolean(
    transcript || replyText || interimTranscript || (status === 'error' && error)
  )
  return (
    <div
      className={clsx(styles.view, styles[status])}
      role="dialog"
      aria-modal="true"
      aria-label={t('liveVoice')}
    >
      <button
        type="button"
        className={styles.close}
        aria-label={t('liveVoiceStop')}
        onClick={stopLiveVoice}
      >
        <IconCloseOutline16 />
      </button>
      <div className={styles.statusPill} role="status" aria-live="polite">
        <span className={styles.statusDot} />
        <span>{t(STATUS_LABELS[status])}</span>
      </div>
      <div className={styles.stage}>
        <div className={styles.visual}>
          <LiveVoiceRing level={listening ? level : 0} mode={RING_MODES[status]} />
          <div
            className={styles.orb}
            style={
              listening
                ? { transform: `translate(-50%, -50%) scale(${1 + level * 0.12})` }
                : undefined
            }
          >
            {status === 'error' ? (
              <span className={styles.orbWarning}>
                <IconWarningOutline16 />
              </span>
            ) : null}
          </div>
        </div>
        {listening ? <p className={styles.hint}>{t('liveVoiceListeningHint')}</p> : null}
        {showCaptions ? (
          <div className={styles.captions} ref={captionsRef}>
            {transcript ? (
              <div className={styles.userRow}>
                <span className={styles.who}>{t('liveVoiceYou')}</span>
                <span className={styles.text}>{transcript}</span>
              </div>
            ) : null}
            {replyText ? (
              <div className={styles.assistantRow}>
                <span className={styles.who}>{t('liveVoiceAssistant')}</span>
                <span className={styles.text}>{replyText}</span>
              </div>
            ) : null}
            {(listening || status === 'interrupted') && interimTranscript ? (
              <div className={styles.userRow}>
                <span className={styles.who}>{t('liveVoiceYou')}</span>
                <span className={clsx(styles.text, styles.interim)}>{interimTranscript}</span>
              </div>
            ) : null}
            {status === 'error' && error ? (
              <div className={clsx(styles.assistantRow, styles.errorRow)}>
                <span className={styles.text}>{error}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <button ref={exitRef} type="button" className={styles.exit} onClick={stopLiveVoice}>
        <IconCloseOutline16 />
        <span>{t('liveVoiceStop')}</span>
      </button>
    </div>
  )
}

import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { Tooltip } from '../base/Tooltip.js'
import { liveVoiceSupported } from '../../services/liveVoice/config.js'
import { toggleLiveVoice, useLiveVoiceConversation } from '../../services/liveVoice/conversation.js'
import { LiveVoiceBars } from './LiveVoiceBars.js'
import styles from './LiveVoiceButton.module.css'

export const LiveVoiceButton = ({
  disabled = false,
  canStart,
}: {
  disabled?: boolean
  canStart?: () => boolean
}) => {
  const t = useTranslate()
  const status = useLiveVoiceConversation((state) => state.status)
  const level = useLiveVoiceConversation((state) => state.level)
  const active = status !== 'idle'
  const supported = liveVoiceSupported()
  const blocked = !supported || disabled

  const label = !supported
    ? t('liveVoiceNotSupported')
    : status === 'idle' || status === 'error'
      ? t('liveVoice')
      : t('liveVoiceStop')
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={clsx(styles.button, active && styles[status], blocked && styles.disabled)}
        aria-label={label}
        aria-pressed={active}
        aria-disabled={blocked}
        onClick={() => {
          if (blocked) {
            return
          }
          if (active || canStart?.() !== false) {
            void toggleLiveVoice()
          }
        }}
      >
        <LiveVoiceBars
          level={status === 'listening' ? level : undefined}
          static={status === 'idle' || status === 'interrupted' || status === 'error'}
          pulse={status === 'thinking'}
        />
        <span className={styles.label}>{t('liveVoice')}</span>
      </button>
    </Tooltip>
  )
}

import clsx from 'clsx'
import styles from './LiveVoiceRing.module.css'

const BAR_COUNT = 48

const RING_RADIUS = 132

const BASE_HEIGHT = 6

export type LiveVoiceRingMode = 'level' | 'bounce' | 'pulse' | 'static'

export const LiveVoiceRing = ({ level = 0, mode }: { level?: number; mode: LiveVoiceRingMode }) => (
  <div className={clsx(styles.ring, styles[mode])} aria-hidden>
    {Array.from({ length: BAR_COUNT }, (_, index) => {
      const angle = (index / BAR_COUNT) * 360
      const phase = Math.abs(Math.sin((index / BAR_COUNT) * Math.PI * 2))
      const height = BASE_HEIGHT + level * 26 * (0.35 + 0.65 * phase)
      return (
        <span
          key={index}
          className={styles.slot}
          style={{ transform: `rotate(${angle}deg) translateY(-${RING_RADIUS}px)` }}
        >
          <span
            className={styles.ringBar}
            style={
              mode === 'level'
                ? { transform: `scaleY(${height / BASE_HEIGHT})` }
                : mode === 'bounce' || mode === 'pulse'
                  ? { animationDelay: `${(index % 12) * 0.08}s` }
                  : undefined
            }
          />
        </span>
      )
    })}
  </div>
)

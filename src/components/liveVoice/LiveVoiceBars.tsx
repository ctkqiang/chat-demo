import clsx from 'clsx'
import styles from './LiveVoiceBars.module.css'

const BAR_LEVELS: [number, number][] = [
  [5, 11],
  [8, 8],
  [12, 4],
]

export const LiveVoiceBars = ({
  level,
  static: isStatic = false,
  pulse = false,
}: {
  level?: number

  static?: boolean

  pulse?: boolean
}) => {
  const heights =
    level === undefined ? null : BAR_LEVELS.map(([base, gain]) => Math.round(base + level * gain))
  return (
    <span
      className={clsx(
        styles.bars,
        heights !== null && styles.level,
        isStatic && styles.static,
        pulse && styles.pulse
      )}
      aria-hidden
    >
      {heights !== null
        ? heights.map((height, index) => (
            <span key={index} className={styles.bar} style={{ height }} />
          ))
        : [0, 1, 2].map((index) => <span key={index} className={styles.bar} />)}
    </span>
  )
}

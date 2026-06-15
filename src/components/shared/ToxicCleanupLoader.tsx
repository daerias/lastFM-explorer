import styles from './ToxicCleanupLoader.module.css'

interface ToxicCleanupLoaderProps {
  /** Progress 0–100. Use -1 for indeterminate (spinner + pulsating river). */
  progress: number
  /** Short label like "Renaming tags..." */
  label: string
}

const BUBBLE_COUNT = 8
const WINDOW_COUNT = 6
const CREATURE_COUNT = 8
const FLOWER_COUNT = 8
const BURST_COUNT = 6
const TRASH_COUNT = 8

export default function ToxicCleanupLoader({ progress, label }: ToxicCleanupLoaderProps) {
  const done = progress >= 100
  const indeterminate = progress < 0
  const pct = done ? 100 : Math.max(0, Math.min(progress, 99))

  return (
    <div className={`${styles.scene} ${done ? styles.done : ''} ${indeterminate ? styles.indeterminate : ''}`}>
      {/* Factory */}
      <div className={styles.factory}>
        <div className={styles.factoryBody}>
          <div className={styles.factoryWindows}>
            {Array.from({ length: WINDOW_COUNT }, (_, i) => (
              <span key={i} className={styles.factoryWindow} />
            ))}
          </div>
        </div>
        <div className={styles.smokestack1} />
        <div className={styles.smokestack2} />
        <div className={styles.smoke}>
          <span className={styles.smokePuff1} />
          <span className={styles.smokePuff2} />
          <span className={styles.smokePuff3} />
        </div>
      </div>

      {/* Toxic Pipe */}
      <div className={styles.pipe} />
      <span className={styles.pipeDrip} />

      {/* Trash specks — pollution dots that disappear on done */}
      <div className={styles.trash}>
        {Array.from({ length: TRASH_COUNT }, (_, i) => (
          <span key={i} className={styles.trashSpeck} />
        ))}
      </div>

      {/* Toxic River — the progress bar */}
      <div className={styles.river}>
        <div
          className={styles.riverFill}
          style={{ width: `${indeterminate ? 100 : pct}%` }}
        >
          <div className={styles.riverBubbles}>
            {Array.from({ length: BUBBLE_COUNT }, (_, i) => (
              <span key={i} className={styles.riverBubble} />
            ))}
          </div>
        </div>
      </div>

      {/* Cleanup Creatures */}
      <div className={styles.creatures}>
        {Array.from({ length: CREATURE_COUNT }, (_, i) => (
          <span key={i} className={styles.creature} />
        ))}
      </div>

      {/* Nature Bloom — on completion */}
      <div className={styles.bloom}>
        {Array.from({ length: FLOWER_COUNT }, (_, i) => (
          <span key={i} className={styles.flower} />
        ))}
      </div>
      <div className={styles.colorBursts}>
        {Array.from({ length: BURST_COUNT }, (_, i) => (
          <span key={i} className={styles.colorBurst} />
        ))}
      </div>

      {/* Progress Info */}
      <div className={styles.progressInfo}>
        {indeterminate && !done && <span className={styles.spinner} />}
        <span className={styles.progressLabel}>
          {done ? 'NATURE RESTORED' : label}
        </span>
        {!indeterminate && (
          <span className={styles.progressPercent}>{pct}%</span>
        )}
      </div>

      {/* Done Badge */}
      <span className={styles.doneBadge}>CLEAN</span>
    </div>
  )
}

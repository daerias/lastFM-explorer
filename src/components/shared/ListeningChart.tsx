import { useMemo, useState, useCallback } from 'react'
import styles from './ListeningChart.module.css'

export interface ChartBucket {
  date: string
  label: string
  count: number
}

export type Aggregation = 'day' | 'week' | 'month'

interface Props {
  days: ChartBucket[]
  /** Compare overlay — shown as a slightly offset lighter bar */
  compareDays?: ChartBucket[]
  aggregation: Aggregation
  onAggregationChange: (a: Aggregation) => void
  onBarClick?: (date: string) => void
  loading?: boolean
  /** If true, bars for the compare series are on a secondary axis */
  compareLoading?: boolean
}

const AGG_OPTIONS: { value: Aggregation; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

export default function ListeningChart({
  days,
  compareDays,
  aggregation,
  onAggregationChange,
  onBarClick,
  loading,
  compareLoading,
}: Props) {
  const allCounts = useMemo(
    () => [...days.map((d) => d.count), ...(compareDays ?? []).map((d) => d.count)],
    [days, compareDays],
  )
  const maxCount = useMemo(() => Math.max(1, ...allCounts), [allCounts])
  const total = useMemo(() => days.reduce((s, d) => s + d.count, 0), [days])
  const compareTotal = compareDays?.reduce((s, d) => s + d.count, 0)
  const isComparing = compareDays && compareDays.length > 0
  const barCount = Math.max(days.length, compareDays?.length ?? 0)

  // ---- Parallax tilt: track mouse position over chart ----
  const [tiltX, setTiltX] = useState(0) // -1..1 horizontal
  const [tiltY, setTiltY] = useState(0) // -1..1 vertical
  const [tiltActive, setTiltActive] = useState(false)

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width   // 0..1
    const y = (e.clientY - rect.top) / rect.height    // 0..1
    setTiltX(x * 2 - 1)    // -1..1
    setTiltY(y * 2 - 1)    // -1..1
    setTiltActive(true)
  }, [])

  const handlePointerLeave = useCallback(() => {
    setTiltActive(false)
    setTiltX(0)
    setTiltY(0)
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Listening Activity</h2>
          {!loading && (
            <p className={styles.sub}>
              {total} scrobbles in {days.length} {aggregation}s · peak {maxCount}
              {isComparing && compareTotal !== undefined && (
                <> — vs {compareTotal} scrobbles</>
              )}
            </p>
          )}
        </div>
        <div className={styles.controls}>
          <div className={styles.pills}>
            {AGG_OPTIONS.map((a) => (
              <button
                key={a.value}
                className={`${styles.pill} ${aggregation === a.value ? styles.pillActive : ''}`}
                onClick={() => onAggregationChange(a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`neuro-pressed ${styles.chartWrap}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {loading || compareLoading ? (
          <div className={styles.skeleton}>
            {Array.from({ length: Math.min(barCount || 7, 14) }).map((_, i) => (
              <div key={i} className={styles.skelBar} />
            ))}
          </div>
        ) : days.length === 0 && (!compareDays || compareDays.length === 0) ? (
          <div className={styles.empty}>No listening data for this period.</div>
        ) : (
          <div className={`${styles.chart} ${barCount > 14 ? styles.chartScrollable : ''}`}>
            {/* Y-axis grid lines */}
            <div className={styles.yAxis}>
              {[4, 3, 2, 1].map((n) => (
                <div key={n} className={styles.gridLine} style={{ bottom: `${(n / 5) * 100}%` }}>
                  <span className={styles.gridLabel}>{Math.round((maxCount / 5) * n)}</span>
                </div>
              ))}
            </div>

            {/* Bars */}
            <div
              className={`${styles.bars} ${tiltActive ? styles.barsTiltActive : ''}`}
              style={{
                ...(barCount > 14 ? { minWidth: `${barCount * 40}px` } : undefined),
                '--tilt-x': tiltX,
                '--tilt-y': tiltY,
              } as React.CSSProperties}
            >
              {days.map((day, i) => {
                const height = (day.count / maxCount) * 100
                const glowIntensity = Math.max(0.15, day.count / maxCount)
                const neonR = 227
                const neonG = 27 + Math.round(140 * glowIntensity)
                const neonB = 35 + Math.round(40 * glowIntensity)

                // Compare bar
                const compareDay = compareDays?.[i]
                const compareHeight = compareDay ? (compareDay.count / maxCount) * 100 : 0

                return (
                  <div
                    key={day.date}
                    className={`${styles.barCol} ${onBarClick ? styles.barColClickable : ''}`}
                    onClick={() => onBarClick?.(day.date)}
                    role={onBarClick ? 'button' : undefined}
                    tabIndex={onBarClick ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && onBarClick) onBarClick(day.date)
                    }}
                    title={onBarClick ? `${day.count} scrobbles — click for details` : undefined}
                  >
                    <div className={styles.barValue}>{day.count}</div>
                    <div className={styles.barStack}>
                      {isComparing && compareDay && (
                        <div
                          className={styles.barCompare}
                          style={{
                            height: `${compareHeight}%`,
                            opacity: glowIntensity * 0.7 + 0.15,
                          }}
                        />
                      )}
                      <div
                        className={styles.bar}
                        style={{
                          height: `${height}%`,
                          background: `linear-gradient(180deg,
                            rgba(${neonR},${neonG},${neonB},0.9) 0%,
                            rgba(${neonR},${neonG},${neonB},0.55) 100%)`,
                          boxShadow: `0 0 ${8 + glowIntensity * 24}px rgba(${neonR},${neonG},${neonB},${0.3 + glowIntensity * 0.5}),
                            inset 1px 1px 1px rgba(255,255,255,0.15)`,
                          animationDelay: `${i * 0.03}s`,
                          '--glow-r': neonR,
                          '--glow-g': neonG,
                          '--glow-b': neonB,
                          '--glow-intensity': glowIntensity,
                        } as React.CSSProperties}
                      />
                    </div>
                    <span className={styles.barLabel}>{day.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {isComparing && (
        <div className={styles.legend}>
          <span className={styles.legendDot} />
          Current period
          <span className={`${styles.legendDot} ${styles.legendDotCompare}`} />
          Comparison
        </div>
      )}
    </div>
  )
}

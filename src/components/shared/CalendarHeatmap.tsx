import { useMemo, useState } from 'react'
import styles from './CalendarHeatmap.module.css'

const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

interface Props {
  /** Map of date string (YYYY-MM-DD) → scrobble count */
  counts: Map<string, number>
  dateFrom: string
  dateTo: string
  onChange: (from: string, to: string) => void
}

export default function CalendarHeatmap({ counts, dateFrom, dateTo, onChange }: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-based
  const [selecting, setSelecting] = useState<'from' | 'to'>('from')

  const maxCount = useMemo(() => {
    let max = 1
    for (const c of counts.values()) if (c > max) max = c
    return max
  }, [counts])

  // Build calendar grid for current month
  const calendar = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    // Monday = 0, Sunday = 6
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: { date: string; day: number; inMonth: boolean; count: number }[] = []

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate()
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const prevMonth = month === 0 ? 11 : month - 1
      const prevYear = month === 0 ? year - 1 : year
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ date: dateStr, day: d, inMonth: false, count: counts.get(dateStr) ?? 0 })
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ date: dateStr, day: d, inMonth: true, count: counts.get(dateStr) ?? 0 })
    }

    // Next month padding to fill last row
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7
    const remaining = totalCells - cells.length
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    for (let d = 1; d <= remaining; d++) {
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ date: dateStr, day: d, inMonth: false, count: counts.get(dateStr) ?? 0 })
    }

    return cells
  }, [year, month, counts])

  const handleDayClick = (date: string) => {
    if (selecting === 'from') {
      onChange(date, dateTo)
      setSelecting('to')
    } else {
      // If clicked date is before from, swap
      if (date < dateFrom) {
        onChange(date, dateFrom)
      } else {
        onChange(dateFrom, date)
      }
      setSelecting('from')
    }
  }

  const isInRange = (date: string) => {
    if (!dateFrom && !dateTo) return false
    if (dateFrom && dateTo) return date >= dateFrom && date <= dateTo
    if (dateFrom) return date === dateFrom
    return date === dateTo
  }

  const isRangeEdge = (date: string) => {
    return date === dateFrom || date === dateTo
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Quick presets
  const presets = [
    { label: '7d', get: () => { const d = new Date(); d.setDate(d.getDate() - 7); return fmt(d) } },
    { label: '14d', get: () => { const d = new Date(); d.setDate(d.getDate() - 14); return fmt(d) } },
    { label: '30d', get: () => { const d = new Date(); d.setDate(d.getDate() - 30); return fmt(d) } },
    { label: 'Today', get: () => fmt(new Date()) },
  ]

  return (
    <div className={styles.calendar}>
      {/* Presets + header */}
      <div className={styles.topRow}>
        <div className={styles.presets}>
          {presets.map((p) => (
            <button
              key={p.label}
              className={styles.presetBtn}
              onClick={() => {
                const from = p.get()
                onChange(from, '')
                setSelecting('to')
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          className={styles.clearRangeBtn}
          onClick={() => { onChange('', ''); setSelecting('from') }}
        >
          Clear
        </button>
      </div>

      {/* Month nav */}
      <div className={styles.monthNav}>
        <button className={styles.navBtn} onClick={prevMonth}>←</button>
        <span className={styles.monthLabel}>{MONTH_NAMES[month]} {year}</span>
        <button className={styles.navBtn} onClick={nextMonth}>→</button>
      </div>

      {/* Selection hint */}
      <p className={styles.hint}>
        {selecting === 'from' ? 'Pick start date' : dateFrom ? `Start: ${dateFrom} — Pick end date` : 'Pick start date'}
      </p>

      {/* Day headers */}
      <div className={styles.weekdays}>
        {DAY_NAMES.map((d) => <span key={d} className={styles.weekday}>{d}</span>)}
      </div>

      {/* Grid */}
      <div className={styles.grid}>
        {calendar.map((cell) => {
          const intensity = maxCount > 0 ? cell.count / maxCount : 0
          const isToday = cell.date === fmt(new Date())
          const isNow = cell.date > fmt(new Date()) && cell.inMonth

          return (
            <button
              key={cell.date}
              className={[
                styles.day,
                !cell.inMonth ? styles.dayOutside : '',
                isInRange(cell.date) ? styles.dayInRange : '',
                isRangeEdge(cell.date) ? styles.dayEdge : '',
                isToday ? styles.dayToday : '',
              ].filter(Boolean).join(' ')}
              style={cell.inMonth && cell.count > 0 ? {
                background: `rgba(227, 27, 35, ${0.08 + intensity * 0.5})`,
                boxShadow: intensity > 0.5 ? `0 0 ${4 + intensity * 12}px var(--accent-glow)` : undefined,
              } : undefined}
              onClick={() => cell.inMonth && handleDayClick(cell.date)}
              disabled={isNow}
            >
              <span className={styles.dayNum}>{cell.day}</span>
              {cell.inMonth && cell.count > 0 && (
                <span className={styles.dayCount}>{cell.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

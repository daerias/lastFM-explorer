import styles from './PeriodSelector.module.css'

type Period = '7day' | '1month' | '3month' | '6month' | '12month' | 'overall'

const periods: { value: Period; label: string }[] = [
  { value: '7day', label: '7d' },
  { value: '1month', label: '1m' },
  { value: '3month', label: '3m' },
  { value: '6month', label: '6m' },
  { value: '12month', label: '1y' },
  { value: 'overall', label: 'All' },
]

interface Props {
  value: Period
  onChange: (p: Period) => void
}

export type { Period }

export { periods }

export default function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className={styles.selector}>
      {periods.map((p) => (
        <button
          key={p.value}
          className={`${styles.pill} ${p.value === value ? styles.active : ''}`}
          onClick={() => onChange(p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

import { useState } from 'react'
import styles from './TagChips.module.css'

interface Props {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  onClear: () => void
  loading?: boolean
  suggestions?: { name: string; count: number }[]
}

export default function TagChips({ tags, onAdd, onRemove, onClear, loading, suggestions }: Props) {
  const [input, setInput] = useState('')

  const handleAdd = (tagName?: string) => {
    const trimmed = (tagName ?? input).trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed)
      setInput('')
    }
  }

  return (
    <div className={styles.wrap}>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); handleAdd() }}
      >
        <input
          className={styles.input}
          type="text"
          placeholder="Search by tags (e.g. rock, electronic)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className={styles.addBtn}
          disabled={loading || !input.trim()}
        >
          +
        </button>
      </form>

      {(suggestions?.filter(
        (s) => !tags.includes(s.name) && s.name.toLowerCase().includes(input.toLowerCase()),
      ) ?? []).length > 0 && !loading && (
        <div className={styles.suggestions}>
          <span className={styles.suggestLabel}>Your tags:</span>
          {(suggestions?.filter(
            (s) => !tags.includes(s.name) && s.name.toLowerCase().includes(input.toLowerCase()),
          ) ?? []).slice(0, 15).map((s) => (
            <button
              key={s.name}
              className={styles.suggestChip}
              onClick={() => handleAdd(s.name)}
              disabled={loading}
            >
              {s.name}
              <span className={styles.suggestCount}>{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className={styles.chips}>
          {tags.map((tag) => (
            <span key={tag} className={styles.chip}>
              {tag}
              <button
                className={styles.chipX}
                onClick={() => onRemove(tag)}
                disabled={loading}
              >
                ×
              </button>
            </span>
          ))}
          <button className={styles.clearBtn} onClick={onClear} disabled={loading}>
            clear all
          </button>
          {loading && <span className={styles.loadingHint}>searching...</span>}
        </div>
      )}
    </div>
  )
}

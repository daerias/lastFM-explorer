/** Format playcount numbers: 1.2M, 5.3K, etc. */
export function formatPlaycount(n: string | number | undefined): string {
  if (n === undefined || n === null) return '—'
  const num = typeof n === 'string' ? parseInt(n, 10) : n
  if (isNaN(num)) return '—'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return String(num)
}

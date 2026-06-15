// Vim-style keyboard navigation for the entire app
// j/k = scroll, Space = play/pause, x = multi-select, gg/G = top/bottom
// z = zen mode toggle, Ctrl+K = command palette, / = search focus
import { useEffect, useCallback, useRef } from 'react'

export interface VimActions {
  onScrollDown?: () => void
  onScrollUp?: () => void
  onToggleSelect?: () => void
  onPlayPause?: () => void
  onGoTop?: () => void
  onGoBottom?: () => void
  onZenToggle?: () => void
  onCommandPalette?: () => void
  onSearchFocus?: () => void
  onEscape?: () => void
}

export function useVimKeys(actions: VimActions, enabled = true) {
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const lastGRef = useRef(0)

  const handler = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const tag = target.tagName.toLowerCase()
    const isInput = tag === 'input' || tag === 'textarea' || target.isContentEditable

    const a = actionsRef.current

    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      a.onCommandPalette?.()
      return
    }

    if (isInput) {
      if (e.key === 'Escape') {
        (target as HTMLInputElement).blur()
        a.onEscape?.()
      }
      return
    }

    switch (e.key) {
      case 'j':
        e.preventDefault()
        a.onScrollDown?.()
        break
      case 'k':
        e.preventDefault()
        a.onScrollUp?.()
        break
      case 'x':
        e.preventDefault()
        a.onToggleSelect?.()
        break
      case ' ':
        e.preventDefault()
        a.onPlayPause?.()
        break
      case 'g':
        if (a.onGoTop) {
          const now = Date.now()
          if (lastGRef.current && now - lastGRef.current < 300) {
            e.preventDefault()
            a.onGoTop()
            lastGRef.current = 0
          } else {
            lastGRef.current = now
          }
        }
        break
      case 'G':
        e.preventDefault()
        a.onGoBottom?.()
        break
      case 'z':
        e.preventDefault()
        a.onZenToggle?.()
        break
      case '/':
        e.preventDefault()
        a.onSearchFocus?.()
        break
      case 'Escape':
        a.onEscape?.()
        break
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, handler])
}

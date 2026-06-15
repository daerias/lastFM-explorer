// Virtual scrolling — only render visible rows, GPU-accelerated via translateY
// 120Hz smooth by using requestAnimationFrame + absolute positioning
import { useState, useEffect, useCallback, useRef } from 'react'

export interface VirtualItem<T> {
  item: T
  index: number
  translateY: number
}

export function useVirtualScroll<T>(
  items: T[],
  rowHeight: number,
  containerRef: React.RefObject<HTMLElement | null>,
  overscan = 10,
) {
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const rafRef = useRef<number | null>(null)

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      const el = containerRef.current
      if (el) setScrollTop(el.scrollTop)
      rafRef.current = null
    })
  }, [containerRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    observer.observe(el)
    setContainerHeight(el.clientHeight)

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      observer.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, handleScroll])

  const totalHeight = items.length * rowHeight

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(containerHeight / rowHeight) + overscan * 2
  const endIndex = Math.min(items.length, startIndex + visibleCount)

  const virtualItems: VirtualItem<T>[] = []
  for (let i = startIndex; i < endIndex; i++) {
    virtualItems.push({
      item: items[i],
      index: i,
      translateY: i * rowHeight,
    })
  }

  return { virtualItems, totalHeight, scrollTop }
}

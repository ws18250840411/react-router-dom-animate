import type { ComponentProps, CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

type TabKey = 'a' | 'b' | 'c'

type TabsIndicatorLayoutProps = {
  basePath: '/push/tabs-indicator' | '/wrap/tabs-indicator'
  tabKeys?: TabKey[]
}

type PillRect = { left: number; width: number }

type DragSession = {
  pointerId: number
  startX: number
  startLeft: number
  moved: boolean
}

const tabState = { transition: 'none', mode: 'switch' } as const
const DRAG_THRESHOLD = 6

const TAB_LABELS: Record<TabKey, string> = {
  a: '首页',
  b: '社区',
  c: '我的',
}

function TabIcon({ tab, active }: { tab: TabKey; active: boolean }) {
  const color = active ? '#1c1c1e' : '#8e8e93'
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true as const }

  if (tab === 'a') {
    return active ? (
      <svg {...common}>
        <path
          fill={color}
          d="M12 3.2 4 10v10.5a1 1 0 0 0 1 1h5.5v-6h3V21.5H19a1 1 0 0 0 1-1V10L12 3.2Z"
        />
      </svg>
    ) : (
      <svg {...common} fill="none" stroke={color} strokeWidth="1.6">
        <path d="M5 10.5 12 4l7 6.5V20a1 1 0 0 1-1 1h-5v-6H11v6H6a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    )
  }

  if (tab === 'b') {
    return active ? (
      <svg {...common}>
        <path
          fill={color}
          d="M12 2a6.5 6.5 0 0 0-6.5 6.5c0 4.8 6.5 13.5 6.5 13.5S18.5 13.3 18.5 8.5A6.5 6.5 0 0 0 12 2Zm0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"
        />
      </svg>
    ) : (
      <svg {...common} fill="none" stroke={color} strokeWidth="1.6">
        <path d="M12 21s6.5-8.7 6.5-13A6.5 6.5 0 1 0 5.5 8c0 4.3 6.5 13 6.5 13Z" />
        <circle cx="12" cy="8" r="2.2" />
      </svg>
    )
  }

  return active ? (
    <svg {...common}>
      <path
        fill={color}
        d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-7 9a7 7 0 0 1 14 0v.5H5V21Z"
      />
    </svg>
  ) : (
    <svg {...common} fill="none" stroke={color} strokeWidth="1.6">
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5.5 20.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  )
}

function TabIndicatorLink({
  active,
  children,
  itemRef,
  ...rest
}: ComponentProps<typeof Link> & { active: boolean; itemRef?: (el: HTMLAnchorElement | null) => void }) {
  return (
    <Link
      ref={itemRef}
      {...rest}
      className={`tab tab-indicator-item${active ? ' is-active' : ''}`}
    >
      {children}
    </Link>
  )
}

export function TabsIndicatorLayout({
  basePath,
  tabKeys = ['a', 'b', 'c'],
}: TabsIndicatorLayoutProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isPush = basePath.startsWith('/push')

  const navRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const pillReadyRef = useRef(false)
  const dragSessionRef = useRef<DragSession | null>(null)
  const suppressClickRef = useRef(false)
  const rippleRafRef = useRef(0)

  const [pillRect, setPillRect] = useState<PillRect>({ left: 0, width: 0 })
  const [pillReady, setPillReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [iconScales, setIconScales] = useState<number[]>(() => tabKeys.map(() => 1))

  const activeKey =
    tabKeys.find((k) => pathname === `${basePath}/${k}` || pathname.endsWith(`/${k}`)) ?? tabKeys[0]
  const activeIndex = Math.max(0, tabKeys.indexOf(activeKey))
  const visualIndex = dragging && previewIndex !== null ? previewIndex : activeIndex

  const computeRippleScales = useCallback(() => {
    const pill = pillRef.current
    if (!pill) {
      return tabKeys.map((_, index) => (index === activeIndex ? 1.06 : 1))
    }

    const pillBox = pill.getBoundingClientRect()
    const pillCenter = pillBox.left + pillBox.width / 2

    return tabKeys.map((_, index) => {
      const item = itemRefs.current[index]
      if (!item) return 1

      const rect = item.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const dist = Math.abs(pillCenter - center)
      const influence = rect.width * 0.72
      const proximity = Math.max(0, 1 - dist / influence)
      return 1 + proximity * 0.18
    })
  }, [activeIndex, tabKeys])

  const syncRipple = useCallback(() => {
    setIconScales(computeRippleScales())
  }, [computeRippleScales])

  const scheduleRipple = useCallback(() => {
    cancelAnimationFrame(rippleRafRef.current)
    rippleRafRef.current = requestAnimationFrame(syncRipple)
  }, [syncRipple])

  const readItemRect = useCallback((index: number): PillRect | null => {
    const nav = navRef.current
    const item = itemRefs.current[index]
    if (!nav || !item) return null

    const navRect = nav.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    return {
      left: itemRect.left - navRect.left,
      width: itemRect.width,
    }
  }, [])

  useEffect(() => {
    if (dragging || !pillReady) return

    let running = true
    let raf = 0

    const tick = () => {
      if (!running) return
      syncRipple()
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
      syncRipple()
    }

    const pill = pillRef.current
    pill?.addEventListener('transitionend', stop, { once: true })
    const timeout = window.setTimeout(stop, 520)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.clearTimeout(timeout)
    }
  }, [activeIndex, dragging, pillReady, syncRipple])

  useEffect(() => {
    return () => cancelAnimationFrame(rippleRafRef.current)
  }, [])

  const measurePill = useCallback(
    (index: number) => {
      const rect = readItemRect(index)
      if (rect) setPillRect(rect)
    },
    [readItemRect],
  )

  const nearestTabIndex = useCallback((clientX: number) => {
    let best = 0
    let bestDist = Infinity

    itemRefs.current.forEach((el, index) => {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const dist = Math.abs(clientX - center)
      if (dist < bestDist) {
        bestDist = dist
        best = index
      }
    })

    return best
  }, [])

  const navigateToTab = useCallback(
    (index: number) => {
      const key = tabKeys[index]
      if (!key || key === activeKey) return
      const to = `${basePath}/${key}`
      if (isPush) {
        navigate(to, { replace: true, state: tabState })
      } else {
        navigate(to, { replace: true })
      }
    },
    [activeKey, basePath, isPush, navigate, tabKeys],
  )

  useLayoutEffect(() => {
    if (dragging) return
    measurePill(activeIndex)
    if (!pillReadyRef.current) {
      pillReadyRef.current = true
      requestAnimationFrame(() => setPillReady(true))
    }
  }, [activeIndex, dragging, measurePill, tabKeys.length])

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const ro = new ResizeObserver(() => {
      if (!dragging) measurePill(activeIndex)
    })
    ro.observe(nav)
    itemRefs.current.forEach((el) => {
      if (el) ro.observe(el)
    })

    return () => ro.disconnect()
  }, [activeIndex, dragging, measurePill, tabKeys.length])

  const finishDrag = (session: DragSession, clientX: number) => {
    if (!session.moved) {
      setDragging(false)
      setPreviewIndex(null)
      return
    }

    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)

    const target = nearestTabIndex(clientX)
    setDragging(false)
    setPreviewIndex(null)
    navigateToTab(target)
    measurePill(target)
  }

  const endPointer = (e: ReactPointerEvent<HTMLElement>) => {
    const session = dragSessionRef.current
    dragSessionRef.current = null
    if (!session || session.pointerId !== e.pointerId) return

    if (session.moved && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    if (session.moved) finishDrag(session, e.clientX)
    else {
      setDragging(false)
      setPreviewIndex(null)
    }
  }

  const onNavPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startLeft: pillRect.left,
      moved: false,
    }
  }

  const onNavPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== e.pointerId) return

    const dx = e.clientX - session.startX
    if (!session.moved && Math.abs(dx) < DRAG_THRESHOLD) return

    if (!session.moved) {
      session.moved = true
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    e.preventDefault()

    const first = readItemRect(0)
    const last = readItemRect(tabKeys.length - 1)
    const preview = nearestTabIndex(e.clientX)
    const previewRect = readItemRect(preview)
    const width = previewRect?.width ?? pillRect.width

    if (!first || !last || !previewRect) return

    const minLeft = first.left
    const maxLeft = last.left + last.width - width
    const left = Math.min(maxLeft, Math.max(minLeft, session.startLeft + dx))

    setPillRect({ left, width })
    setPreviewIndex(preview)
    scheduleRipple()
  }

  const onNavPointerUp = endPointer
  const onNavPointerCancel = endPointer

  const onNavClickCapture = (e: React.MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const renderTabContent = (key: TabKey, index: number) => (
    <>
      <span
        className="tab-indicator-icon"
        style={{ transform: `scale(${iconScales[index] ?? 1})` }}
      >
        <TabIcon tab={key} active={index === visualIndex} />
      </span>
      <span className="tab-indicator-label">{TAB_LABELS[key]}</span>
    </>
  )

  const pillStyle: CSSProperties = {
    left: pillRect.left,
    width: pillRect.width,
    opacity: pillReady && pillRect.width > 0 ? 1 : 0,
  }

  return (
    <div className="app-shell app-shell--floating-tab">
      <header className="subbar">
        <button type="button" className="tab secondary" data-testid="back-tabs" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span>{isPush ? 'push' : 'wrap'} / tabs · none · 拖拽滑块</span>
      </header>
      <main className="app-main">
        {isPush ? <AnimatedOutlet /> : <AnimatedOutlet mode="switch" transition="none" />}
      </main>
      <div className="tabs-indicator-dock">
        <nav
          ref={navRef}
          className={`tabs tabs-indicator${dragging ? ' is-dragging' : ''}`}
          data-testid="tabs-indicator-nav"
          onPointerDown={onNavPointerDown}
          onPointerMove={onNavPointerMove}
          onPointerUp={onNavPointerUp}
          onPointerCancel={onNavPointerCancel}
          onClickCapture={onNavClickCapture}
        >
          <span
            ref={pillRef}
            className={`tabs-indicator-pill${pillReady ? ' is-ready' : ''}${dragging ? ' is-dragging' : ''}`}
            aria-hidden
            data-testid="tabs-indicator-pill"
            style={pillStyle}
          />
          {tabKeys.map((key, index) =>
            isPush ? (
              <TabIndicatorLink
                key={key}
                to={`${basePath}/${key}`}
                replace
                state={tabState}
                active={visualIndex === index}
                data-testid={`tab-link-${key}`}
                itemRef={(el) => {
                  itemRefs.current[index] = el
                }}
              >
                {renderTabContent(key, index)}
              </TabIndicatorLink>
            ) : (
              <NavLink
                key={key}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                to={`${basePath}/${key}`}
                replace
                data-testid={`tab-link-${key}`}
                className={({ isActive }) =>
                  `tab tab-indicator-item${(dragging ? visualIndex === index : isActive) ? ' is-active' : ''}`
                }
              >
                {renderTabContent(key, index)}
              </NavLink>
            ),
          )}
        </nav>
      </div>
    </div>
  )
}

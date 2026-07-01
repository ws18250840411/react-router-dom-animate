import {
  Activity,
  cloneElement,
  createContext,
  createRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  UNSAFE_LocationContext,
  useLocation,
  useMatches,
  useNavigationType,
  useOutlet,
  type Location,
  type UIMatch,
} from 'react-router-dom'
import { CSSTransition, TransitionGroup } from 'react-transition-group'

import {
  layoutRouteId,
  planTransition,
  registerLayoutScope,
  registerPageAnim,
  resolveOutletMode,
  resolveTabs,
  sameLayoutPage,
  unregisterLayoutScope,
  unregisterPageAnim,
  IDLE,
} from './transition'
import type { ClassNames, KeepAliveRef, OutletMode, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

export interface AnimatedOutletProps {
  transition?: RouteAnimType
  tabs?: boolean
  mode?: OutletMode
  keepAlive?: boolean
  /**
   * Maximum number of pages to keep alive simultaneously (LRU eviction).
   * Only applies when `keepAlive={true}`. Defaults to unlimited.
   * When the limit is exceeded, the least-recently-visited page is unmounted.
   */
  max?: number
  /**
   * Ref for imperative cache control. Only applies when `keepAlive={true}`.
   * After mount, `aliveRef.current` exposes `remove`, `removeAll`, and
   * `getCached` to manipulate the page cache from outside the component.
   *
   * @example
   * const aliveRef = useRef<KeepAliveRef>()
   * <AnimatedOutlet keepAlive aliveRef={aliveRef} />
   * // later:
   * aliveRef.current?.remove('/home')
   */
  aliveRef?: RefObject<KeepAliveRef | undefined>
  /**
   * When true, pages exited via forward (PUSH) navigation are kept alive in
   * the DOM instead of being unmounted. Returning to a kept-alive page (POP)
   * restores the exact DOM state — including scroll positions — without any
   * component remount.
   */
  keepBackground?: boolean
  className?: string
  children?: ReactNode
}

const DepthContext = createContext(0)
// Signals that this subtree is inside an alive=false (exiting) BackgroundPreserveRoot entry.
// Nested BackgroundPreserveRoots must not update their outlet/locCtx while frozen.
const FrozenContext = createContext(false)

function pageTransitionKey(
  mode: OutletMode,
  _depth: number,
  matches: UIMatch[],
  pathname: string,
  locationKey: string,
): string {
  if (mode === 'switch') return pathname
  // Use layout-route ID so intermediate layouts (e.g. a tabs layout wrapping
  // KeepAliveRoot) are not remounted on every same-layout navigation.
  return layoutRouteId(matches, pathname) ?? locationKey
}

function snap(location: Location, matches: UIMatch[]): RouteSnapshot {
  return {
    path: location.pathname,
    key: location.key,
    state: location.state,
    matches: matches.map((m) => ({ ...m })),
  }
}

function PageScope({ transition, children }: { transition: RouteAnimType; children: ReactNode }) {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    registerPageAnim(pathname, transition)
    return () => unregisterPageAnim(pathname)
  }, [pathname, transition])
  return children
}

/**
 * Freezes the exiting page's outlet at the moment of navigation so it doesn't
 * re-render with the new route while its exit animation plays.
 *
 * Uses `UNSAFE_LocationContext` — an internal RRD API. If removed in a future
 * RRD version the exiting page will show the new route's content during exit
 * (visual glitch only, not a hard error). Pin RRD and verify after upgrading.
 */
function FrozenOutlet({ outlet, locCtx }: { outlet: ReactNode; locCtx: unknown }) {
  const [frozen] = useState(outlet)
  const [frozenCtx] = useState(locCtx)
  return (
    <UNSAFE_LocationContext.Provider value={frozenCtx as never}>{frozen}</UNSAFE_LocationContext.Provider>
  )
}

function PageTransition({
  outlet,
  locCtx,
  classNames,
  timeout,
  live,
  onExited,
  ...transitionProps
}: {
  outlet: ReactNode
  locCtx: unknown
  classNames: ClassNames
  timeout: number | { enter: number; exit: number }
  live?: boolean
  onExited?: () => void
} & Record<string, unknown>) {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  return (
    <CSSTransition
      {...transitionProps}
      nodeRef={nodeRef}
      timeout={timeout}
      classNames={classNames}
      mountOnEnter
      unmountOnExit
      onExited={onExited}
    >
      <div ref={nodeRef} className="animated-outlet-page">
        {live ? (
          <UNSAFE_LocationContext.Provider value={locCtx as never}>{outlet}</UNSAFE_LocationContext.Provider>
        ) : (
          <FrozenOutlet outlet={outlet} locCtx={locCtx} />
        )}
      </div>
    </CSSTransition>
  )
}

const PageActiveContext = createContext<string | null>(null)

/**
 * PUSH navigation keeps the exiting page alive via `<Activity mode="hidden">` after
 * its exit animation completes. POP switches it back to `mode="visible"` and plays
 * the enter animation.
 *
 * `display:none` resets scrollTop for nested overflow containers, so scroll positions
 * are saved in `onExited` (while the DOM is still visible) and restored in
 * `useLayoutEffect` after Activity makes the page visible again.
 */
function BackgroundPreserveRoot({
  depth,
  mode: modeProp,
  tabs: tabsProp,
  layoutTransition,
  className,
}: {
  depth: number
  mode?: OutletMode
  tabs?: boolean
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const isFrozen = useContext(FrozenContext)

  const tabs = resolveTabs(tabsProp, location.state, depth)
  const mode = resolveOutletMode(modeProp, matches, location.state, tabs)
  const fallback = layoutTransition ?? (tabs ? 'none' : 'cover')
  const pageKey = pageTransitionKey(mode, depth, matches, location.pathname, location.key)

  const fromSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const toSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const lastToKeyRef = useRef(location.key)
  if (lastToKeyRef.current !== location.key) {
    lastToKeyRef.current = location.key
    toSnapRef.current = snap(location, matches)
  }
  const [settledLocation, setSettledLocation] = useState(location)
  if (settledLocation.key === location.key) fromSnapRef.current = toSnapRef.current
  const locationRef = useRef(location)
  locationRef.current = location
  const settledKeyRef = useRef(settledLocation.key)
  settledKeyRef.current = settledLocation.key
  const commitSettled = useCallback(() => {
    if (settledKeyRef.current !== locationRef.current.key) setSettledLocation(locationRef.current)
  }, [])

  const activePlan: TransitionPlan = useMemo(() => {
    const fromSnap = fromSnapRef.current
    const toSnap = toSnapRef.current
    if (!tabs && sameLayoutPage(fromSnap, toSnap)) return IDLE
    const effectiveNav =
      mode === 'switch' && navType === 'PUSH' && fromSnap.path !== toSnap.path ? 'REPLACE' : navType
    return planTransition(effectiveNav, fromSnap, toSnap, fallback, { tabs })
  }, [tabs, mode, navType, depth, location.key, settledLocation.key, fallback])

  const timeout =
    activePlan.duration > 0 ? { enter: activePlan.duration, exit: activePlan.duration } : 0

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    if (activePlan.duration <= 0) {
      if (settledLocation.pathname === location.pathname) return
      commitSettled()
      return
    }
    const timer = window.setTimeout(commitSettled, activePlan.duration + 50)
    return () => window.clearTimeout(timer)
  }, [location.key, activePlan.duration, settledLocation.key, commitSettled])

  type StackEntry = {
    locKey: string
    pageKey: string
    outlet: ReactNode
    locCtx: unknown
    nodeRef: RefObject<HTMLDivElement | null>
    alive: boolean
    activityMode: 'visible' | 'hidden'
    // true = this entry was restored from the back-stack via POP.
    // Skip the enter animation so the exiting foreground page slides away above it.
    skipEnter?: boolean
  }

  const nodeRefsCache = useRef(new Map<string, RefObject<HTMLDivElement | null>>())
  const getNodeRef = useCallback((key: string): RefObject<HTMLDivElement | null> => {
    if (!nodeRefsCache.current.has(key)) {
      nodeRefsCache.current.set(key, createRef<HTMLDivElement | null>())
    }
    return nodeRefsCache.current.get(key)!
  }, [])

  const stackRef = useRef<StackEntry[]>([])
  const [, forceRender] = useReducer((n: number) => n + 1, 0)
  const pendingEnterRef = useRef(new Set<string>())

  // Scroll positions saved in onExited (while DOM is still visible, before display:none).
  // Restored in useLayoutEffect after POP makes the entry visible again.
  const bgScrollsRef = useRef(new Map<string, Array<[HTMLElement, number, number]>>())
  const pendingScrollRestoreRef = useRef(new Set<string>())

  const locKey = location.key
  const topEntry = stackRef.current[stackRef.current.length - 1] as StackEntry | undefined

  if (!topEntry) {
    stackRef.current = [
      { locKey, pageKey, outlet, locCtx, nodeRef: getNodeRef(locKey), alive: true, activityMode: 'visible' },
    ]
  } else if (topEntry.locKey !== locKey) {
    if (navType === 'POP') {
      const stack = stackRef.current
      let bgIdx = -1
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].locKey === locKey) { bgIdx = i; break }
      }
      if (bgIdx >= 0) {
        const below = stackRef.current.slice(0, bgIdx)
        const poppedOff = stackRef.current.slice(bgIdx + 1).map(e => ({ ...e, alive: false }))
        // skipEnter=true: restored entry must not play an enter animation —
        // the exiting foreground page slides away on top via DOM order.
        const restored: StackEntry = { ...stackRef.current[bgIdx], outlet, locCtx, activityMode: 'visible', skipEnter: true }
        stackRef.current = [...below, ...poppedOff, restored]
        if (bgScrollsRef.current.has(locKey)) {
          pendingScrollRestoreRef.current.add(locKey)
        }
      } else {
        // Target not found in back-stack (jumped back multiple levels).
        stackRef.current = [
          { locKey, pageKey, outlet, locCtx, nodeRef: getNodeRef(locKey), alive: true, activityMode: 'visible' },
        ]
      }
    } else if (navType === 'PUSH') {
      stackRef.current = [
        ...stackRef.current,
        { locKey, pageKey, outlet, locCtx, nodeRef: getNodeRef(locKey), alive: true, activityMode: 'visible' },
      ]
      // Two-render trick: first paint with in={false} so CSSTransition starts in
      // "exited" state; useLayoutEffect then flips to in={true} to play the enter animation.
      pendingEnterRef.current.add(locKey)
    } else {
      // REPLACE: swap top entry, clean up replaced entry to prevent memory leaks.
      const replaced = stackRef.current[stackRef.current.length - 1]
      if (replaced && replaced.locKey !== locKey) {
        nodeRefsCache.current.delete(replaced.locKey)
        bgScrollsRef.current.delete(replaced.locKey)
      }
      stackRef.current = [
        ...stackRef.current.slice(0, -1),
        { locKey, pageKey, outlet, locCtx, nodeRef: getNodeRef(locKey), alive: true, activityMode: 'visible' },
      ]
    }
  } else if (!isFrozen) {
    // When frozen (inside an alive=false exiting entry), skip outlet/locCtx updates so
    // nested BackgroundPreserveRoots don't replace exiting content with the new route's outlet.
    stackRef.current = stackRef.current.map((e, i, arr) =>
      i === arr.length - 1 ? { ...e, outlet, locCtx } : e,
    )
  }

  useLayoutEffect(() => {
    if (pendingEnterRef.current.size > 0) {
      pendingEnterRef.current.clear()
      forceRender()
    }
  })

  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current.size === 0) return
    pendingScrollRestoreRef.current.forEach((lk) => {
      const saved = bgScrollsRef.current.get(lk)
      const container = nodeRefsCache.current.get(lk)?.current
      if (saved && container) {
        for (const [el, top, left] of saved) {
          if (el.isConnected) {
            el.scrollTop = top
            el.scrollLeft = left
          }
        }
      }
    })
    pendingScrollRestoreRef.current.clear()
  })

  // Render exiting entries (alive=false) last so they paint on top of the restored
  // background page in the correct stacking order — no z-index hacks required.
  const logicalStack = stackRef.current
  const renderStack = [...logicalStack].sort((a, b) => {
    if (a.alive === b.alive) return 0
    return a.alive ? -1 : 1
  })

  return (
    <div className={className ? `animated-outlet-group ${className}` : 'animated-outlet-group'}>
      {renderStack.map((entry) => {
        const logicalIdx = logicalStack.indexOf(entry)
        const isTop = logicalIdx === logicalStack.length - 1
        const isSecond = logicalIdx === logicalStack.length - 2
        // Restored background entries (POP) appear immediately without an enter animation:
        // the exiting foreground page paints on top via DOM order (rendered last).
        const skipEnter = isTop && entry.skipEnter === true
        // Only the top two entries need animation; deeper entries stay hidden via Activity.
        const entryTimeout = skipEnter ? 0 : (isTop || isSecond ? timeout : 0)
        const entryClassNames = skipEnter ? {} : (isTop || isSecond ? activePlan.classNames : {})
        // First paint with in={false}; useLayoutEffect then flips to in={true}.
        const inProp = isTop && !pendingEnterRef.current.has(entry.locKey)
        return (
          <Activity key={entry.locKey} mode={entry.activityMode}>
            <CSSTransition
              nodeRef={entry.nodeRef}
              in={inProp}
              timeout={entryTimeout}
              classNames={entryClassNames}
              mountOnEnter={false}
              unmountOnExit={!entry.alive}
              onExited={() => {
                if (!entry.alive) {
                  stackRef.current = stackRef.current.filter(e => e.locKey !== entry.locKey)
                  nodeRefsCache.current.delete(entry.locKey)
                  bgScrollsRef.current.delete(entry.locKey)
                  forceRender()
                } else {
                  // Save scroll before display:none resets scrollTop, then go hidden.
                  const container = entry.nodeRef.current
                  if (container) {
                    const scrollables: Array<[HTMLElement, number, number]> = []
                    ;[container, ...Array.from(container.querySelectorAll<HTMLElement>('*'))].forEach((el) => {
                      if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
                        scrollables.push([el, el.scrollTop, el.scrollLeft])
                      }
                    })
                    bgScrollsRef.current.set(entry.locKey, scrollables)
                  }
                  stackRef.current = stackRef.current.map(e =>
                    e.locKey === entry.locKey ? { ...e, activityMode: 'hidden' as const } : e,
                  )
                  forceRender()
                }
              }}
            >
              <div ref={entry.nodeRef} className="animated-outlet-page">
                {entry.alive ? (
                  <UNSAFE_LocationContext.Provider value={entry.locCtx as never}>
                    {entry.outlet}
                  </UNSAFE_LocationContext.Provider>
                ) : (
                  // Freeze outlet inside exiting entries so nested BackgroundPreserveRoots
                  // don't replace the exiting content with the new route's outlet.
                  <FrozenContext.Provider value={true}>
                    <UNSAFE_LocationContext.Provider value={entry.locCtx as never}>
                      {entry.outlet}
                    </UNSAFE_LocationContext.Provider>
                  </FrozenContext.Provider>
                )}
              </div>
            </CSSTransition>
          </Activity>
        )
      })}
    </div>
  )
}

/**
 * Implements `keepAlive={true}` for `<AnimatedOutlet>`.
 *
 * Each unique pathname is cached via `<Activity>`. The active page is
 * `mode="visible"`; all others are `mode="hidden"` (display:none). React state
 * is preserved across switches; Effects are cleaned up while hidden.
 *
 * `display:none` resets scrollTop for nested overflow containers, so scroll
 * positions are tracked via capture-phase listeners and restored in useLayoutEffect.
 *
 * Known limitation: video/audio elements pause when hidden, and iframes may
 * reload — this is a browser-level consequence of display:none.
 */
function KeepAliveRoot({
  max,
  aliveRef,
  layoutTransition: _layoutTransition,
  className,
}: {
  max?: number
  aliveRef?: RefObject<KeepAliveRef | undefined>
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const location = useLocation()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const pageKey = location.pathname

  type PageSnap = { outlet: ReactNode; locCtx: unknown }

  const snapshotsRef = useRef(new Map<string, PageSnap>())
  // Tail is most-recently-used (LRU order).
  const keysRef = useRef<string[]>([])
  const pageKeyRef = useRef(pageKey)
  pageKeyRef.current = pageKey
  const [, forceRender] = useReducer((n: number) => n + 1, 0)

  const containerRefsRef = useRef(new Map<string, HTMLDivElement>())
  const scrollCacheRef = useRef(new Map<string, Array<[HTMLElement, number, number]>>())

  snapshotsRef.current.set(pageKey, { outlet, locCtx })

  // Move current key to tail (most-recently-used).
  if (keysRef.current.includes(pageKey)) {
    keysRef.current = keysRef.current.filter((k) => k !== pageKey)
  }
  keysRef.current = [...keysRef.current, pageKey]

  if (max !== undefined && keysRef.current.length > max) {
    const evicted = keysRef.current.slice(0, keysRef.current.length - max)
    keysRef.current = keysRef.current.slice(keysRef.current.length - max)
    for (const k of evicted) {
      snapshotsRef.current.delete(k)
      scrollCacheRef.current.delete(k)
    }
  }

  // Capture-phase scroll listener on each page container: tracks positions for
  // all scrollable descendants. Concurrent-mode safe — no render-phase DOM reads.
  useLayoutEffect(() => {
    const cleanups: Array<() => void> = []
    containerRefsRef.current.forEach((container, key) => {
      const handler = () => {
        const items: Array<[HTMLElement, number, number]> = []
        ;[container, ...Array.from(container.querySelectorAll<HTMLElement>('*'))].forEach((el) => {
          if (el.scrollTop !== 0 || el.scrollLeft !== 0) items.push([el, el.scrollTop, el.scrollLeft])
        })
        scrollCacheRef.current.set(key, items)
      }
      container.addEventListener('scroll', handler, { capture: true, passive: true })
      cleanups.push(() => container.removeEventListener('scroll', handler, { capture: true }))
    })
    return () => cleanups.forEach((c) => c())
  })

  // Restore scroll after Activity removes display:none (runs synchronously post-commit).
  useLayoutEffect(() => {
    const saved = scrollCacheRef.current.get(pageKey)
    if (saved?.length) {
      for (const [el, top, left] of saved) {
        if (el.isConnected) {
          el.scrollTop = top
          el.scrollLeft = left
        }
      }
    }
  }, [pageKey])

  useLayoutEffect(() => {
    if (!aliveRef) return
    aliveRef.current = {
      remove(pathname) {
        if (pathname === pageKeyRef.current) return
        snapshotsRef.current.delete(pathname)
        keysRef.current = keysRef.current.filter((k) => k !== pathname)
        scrollCacheRef.current.delete(pathname)
        forceRender()
      },
      removeAll() {
        const active = pageKeyRef.current
        for (const k of [...keysRef.current]) {
          if (k !== active) {
            snapshotsRef.current.delete(k)
            scrollCacheRef.current.delete(k)
          }
        }
        keysRef.current = keysRef.current.filter((k) => k === active)
        forceRender()
      },
      getCached() {
        return [...keysRef.current]
      },
    }
    return () => {
      aliveRef.current = undefined
    }
  }, [aliveRef])

  return (
    <div className={className ? `animated-outlet-group ${className}` : 'animated-outlet-group'}>
      {keysRef.current.map((key) => {
        const snap = snapshotsRef.current.get(key)!
        return (
          <Activity key={key} mode={key === pageKey ? 'visible' : 'hidden'}>
            <div
              className="animated-outlet-page"
              ref={(el) => {
                if (el) containerRefsRef.current.set(key, el)
                else containerRefsRef.current.delete(key)
              }}
            >
              <PageActiveContext.Provider value={pageKey}>
                <UNSAFE_LocationContext.Provider value={snap.locCtx as never}>
                  {snap.outlet}
                </UNSAFE_LocationContext.Provider>
              </PageActiveContext.Provider>
            </div>
          </Activity>
        )
      })}
    </div>
  )
}

function usePageActive(): boolean {
  const activeKey = useContext(PageActiveContext)
  const { pathname } = useLocation()
  if (activeKey === null) return true
  return activeKey === pathname
}

/**
 * Fires every time the page becomes active, including on initial mount.
 * Deferred to a microtask so it always runs asynchronously, consistent with `useDeactivated`.
 * StrictMode safe: the re-mount cancels the pending microtask before it fires.
 */
export function useActivated(callback: () => void): void {
  const isActive = usePageActive()
  const cbRef = useRef(callback)
  cbRef.current = callback
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    cancelRef.current?.()
    cancelRef.current = null

    if (!isActive) return

    let cancelled = false
    cancelRef.current = () => { cancelled = true }
    Promise.resolve().then(() => { if (!cancelled) cbRef.current() })
  }, [isActive])
}

/**
 * Fires every time the page is deactivated (tab switch or unmount).
 * Outside keepAlive: equivalent to a `useEffect` cleanup.
 * StrictMode safe: the re-mount cancels any pending microtask before it fires.
 */
export function useDeactivated(callback: () => void): void {
  const isInKeepAlive = useContext(PageActiveContext) !== null
  const isActive = usePageActive()
  const cbRef = useRef(callback)
  cbRef.current = callback
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    cancelRef.current?.()
    cancelRef.current = null

    if (!isInKeepAlive) return () => { cbRef.current() }

    if (!isActive) {
      cbRef.current()
      return
    }

    return () => {
      let cancelled = false
      cancelRef.current = () => { cancelled = true }
      Promise.resolve().then(() => { if (!cancelled) cbRef.current() })
    }
  }, [isActive, isInKeepAlive])
}

function LayoutScopeRegistrar({ transition }: { transition: RouteAnimType }) {
  const depth = useContext(DepthContext)
  const matches = useMatches()
  const { pathname } = useLocation()
  const scopeId = layoutRouteId(matches, pathname)

  useLayoutEffect(() => {
    if (!scopeId || depth <= 0) return
    registerLayoutScope(scopeId, transition)
    return () => unregisterLayoutScope(scopeId)
  }, [scopeId, transition, depth])

  return null
}

function AnimatedRoot({
  depth,
  mode: modeProp,
  tabs: tabsProp,
  layoutTransition,
  className,
}: {
  depth: number
  mode?: OutletMode
  tabs?: boolean
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const tabs = resolveTabs(tabsProp, location.state, depth)
  const mode = resolveOutletMode(modeProp, matches, location.state, tabs)
  const fallback = layoutTransition ?? (tabs ? 'none' : 'cover')
  const pageKey = pageTransitionKey(mode, depth, matches, location.pathname, location.key)

  // Snapshot pageKey on location.key change only: useMatches() reads the global
  // router state (not frozen by UNSAFE_LocationContext), so inside a keepBackground
  // background entry it can drift and produce a different pageKey — causing
  // TransitionGroup to re-key its child and destroy the kept-alive DOM.
  const stablePageKeyRef = useRef(pageKey)
  const stablePageKeyLocRef = useRef(location.key)
  if (stablePageKeyLocRef.current !== location.key) {
    stablePageKeyLocRef.current = location.key
    stablePageKeyRef.current = pageKey
  }
  const stablePageKey = stablePageKeyRef.current

  const locationRef = useRef(location)
  locationRef.current = location
  const [settledLocation, setSettledLocation] = useState(location)

  const fromSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const toSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const lastToKeyRef = useRef(location.key)

  if (lastToKeyRef.current !== location.key) {
    lastToKeyRef.current = location.key
    toSnapRef.current = snap(location, matches)
  }

  if (settledLocation.key === location.key) {
    fromSnapRef.current = toSnapRef.current
  }

  const activePlan: TransitionPlan = useMemo(() => {
    const fromSnap = fromSnapRef.current
    const toSnap = toSnapRef.current
    if (!tabs && sameLayoutPage(fromSnap, toSnap)) return IDLE
    const effectiveNav =
      mode === 'switch' && navType === 'PUSH' && fromSnap.path !== toSnap.path ? 'REPLACE' : navType
    return planTransition(effectiveNav, fromSnap, toSnap, fallback, { tabs })
  }, [tabs, mode, navType, depth, location.key, settledLocation.key, fallback])

  const timeout =
    activePlan.duration > 0 ? { enter: activePlan.duration, exit: activePlan.duration } : 0

  const liveOutlet = activePlan.duration <= 0

  const settledKeyRef = useRef(settledLocation.key)
  settledKeyRef.current = settledLocation.key

  const commitSettled = useCallback(() => {
    if (settledKeyRef.current !== locationRef.current.key) {
      setSettledLocation(locationRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    if (activePlan.duration <= 0) {
      if (settledLocation.pathname === location.pathname) return
      commitSettled()
      return
    }
    const timer = window.setTimeout(commitSettled, activePlan.duration + 50)
    return () => window.clearTimeout(timer)
  }, [location.key, activePlan.duration, settledLocation.key, commitSettled])

  const childFactory = useCallback(
    (child: ReactElement) =>
      cloneElement(child, {
        classNames: activePlan.classNames,
        timeout,
        onExited: commitSettled,
      } as never),
    [activePlan.classNames, timeout, commitSettled],
  )

  return (
    <TransitionGroup
      className={className ? `animated-outlet-group ${className}` : 'animated-outlet-group'}
      childFactory={childFactory}
    >
      <PageTransition
        key={stablePageKey}
        outlet={outlet}
        locCtx={locCtx}
        live={liveOutlet}
        classNames={activePlan.classNames}
        timeout={timeout}
        onExited={commitSettled}
      />
    </TransitionGroup>
  )
}

export default function AnimatedOutlet({
  transition,
  tabs,
  keepAlive: keepAliveProp,
  max,
  aliveRef,
  keepBackground: keepBackgroundProp,
  mode,
  className,
  children,
}: AnimatedOutletProps) {
  const depth = useContext(DepthContext)
  const matches = useMatches()

  // Props take precedence over route handle flags.
  const handleFlags = matches.reduce<{ keepAlive?: boolean; keepBackground?: boolean }>(
    (acc, m) => {
      const h = m.handle as Record<string, unknown> | null | undefined
      if (h?.keepAlive === true) acc.keepAlive = true
      if (h?.keepBackground === true) acc.keepBackground = true
      return acc
    },
    {},
  )
  const keepAlive = keepAliveProp ?? handleFlags.keepAlive
  const keepBackground = keepBackgroundProp ?? handleFlags.keepBackground

  if (children !== undefined && transition !== undefined) {
    return <PageScope transition={transition}>{children}</PageScope>
  }

  if (keepAlive) {
    return (
      <DepthContext.Provider value={depth + 1}>
        {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
        <KeepAliveRoot max={max} aliveRef={aliveRef} layoutTransition={transition} className={className} />
      </DepthContext.Provider>
    )
  }

  if (keepBackground) {
    return (
      <DepthContext.Provider value={depth + 1}>
        {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
        <BackgroundPreserveRoot
          depth={depth}
          tabs={tabs}
          mode={mode}
          layoutTransition={transition}
          className={className}
        />
      </DepthContext.Provider>
    )
  }

  return (
    <DepthContext.Provider value={depth + 1}>
      {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
      <AnimatedRoot depth={depth} tabs={tabs} mode={mode} layoutTransition={transition} className={className} />
    </DepthContext.Provider>
  )
}

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
  sameLayoutPage,
  unregisterLayoutScope,
  unregisterPageAnim,
  IDLE,
} from './transition'
import type { ClassNames, KeepAliveFilter, KeepAliveRef, OutletMode, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

export interface AnimatedOutletProps {
  transition?: RouteAnimType
  mode?: OutletMode
  /**
   * Keep pages alive in the DOM using React's `<Activity>` component.
   *
   * **Stack mode** (`keepAlive` without `mode="switch"`): pages pushed forward
   * are preserved in the background. Returning via POP restores the exact DOM
   * state — including scroll positions — with the exit animation playing over
   * the background page. Use this for list → detail → back navigation.
   *
   * **Switch mode** (`keepAlive mode="switch"`): all visited pages are cached
   * by pathname and instantly shown/hidden when switching. Use `max` to limit
   * the cache size (LRU eviction). Use this for bottom-tab navigation.
   *
   * Can also be set via route `handle`: `handle: { keepAlive: true }`.
   */
  keepAlive?: boolean
  /**
   * Maximum number of pages to keep in cache simultaneously (LRU eviction).
   * Only applies when `keepAlive={true}` and `mode="switch"`. Defaults to unlimited.
   */
  max?: number
  /**
   * Allow-list: only pathnames matching this filter are cached.
   * Pages not matched will still render while active, but are discarded when
   * navigating away (not preserved in Activity).
   *
   * Only applies when `keepAlive={true}` and `mode="switch"`.
   *
   * @example
   * // cache only the three tab roots
   * <AnimatedOutlet keepAlive mode="switch" include={['/home', '/profile', '/settings']} />
   * // cache all pages under /tabs/
   * <AnimatedOutlet keepAlive mode="switch" include={/^\/tabs\//} />
   */
  include?: KeepAliveFilter
  /**
   * Deny-list: pathnames matching this filter are NOT cached (evicted on exit).
   * All other pages are cached as normal.
   *
   * Only applies when `keepAlive={true}` and `mode="switch"`.
   *
   * @example
   * // never cache one-time pages like forms or confirmation screens
   * <AnimatedOutlet keepAlive mode="switch" exclude={['/checkout', '/payment']} />
   * <AnimatedOutlet keepAlive mode="switch" exclude={(path) => path.startsWith('/form')} />
   */
  exclude?: KeepAliveFilter
  /**
   * Imperative handle for cache control. Only applies when `keepAlive` and `mode="switch"`.
   * After mount, `aliveRef.current` exposes `remove`, `removeAll`, and `getCached`.
   *
   * @example
   * const aliveRef = useRef<KeepAliveRef>()
   * <AnimatedOutlet keepAlive mode="switch" aliveRef={aliveRef} />
   * aliveRef.current?.remove('/home')
   */
  aliveRef?: RefObject<KeepAliveRef | undefined>
  className?: string
  children?: ReactNode
}

const DepthContext = createContext(0)
// Signals that this subtree is inside an alive=false (exiting) BackgroundPreserveRoot entry.
// Nested BackgroundPreserveRoots must not update their outlet/locCtx while frozen.
const FrozenContext = createContext(false)

function pageTransitionKey(
  mode: OutletMode,
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

/** Extract the initial-position class (fr-tab-pre-enter-*) from a CSSTransition enter className string. */
function extractPreEnterClass(enterClass: string | undefined): string {
  if (!enterClass) return ''
  const match = /\bfr-tab-pre-enter-\S+/.exec(enterClass)
  return match ? match[0] : ''
}

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
  layoutTransition,
  className,
}: {
  depth: number
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const isFrozen = useContext(FrozenContext)

  const fallback = layoutTransition ?? 'cover'
  const pageKey = pageTransitionKey('stack', matches, location.pathname, location.key)

  const fromSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const toSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const lastToKeyRef = useRef(location.key)
  if (lastToKeyRef.current !== location.key) {
    // Capture "from" as the last destination before updating "to".
    // This ensures rapid A→B→A navigation (B animation interrupted) still
    // computes the correct B→A direction instead of treating it as A→A (IDLE).
    fromSnapRef.current = toSnapRef.current
    lastToKeyRef.current = location.key
    toSnapRef.current = snap(location, matches)
  }
  const [settledLocation, setSettledLocation] = useState(location)
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
    if (sameLayoutPage(fromSnap, toSnap)) return IDLE
    return planTransition(navType, fromSnap, toSnap, fallback)
  }, [navType, depth, location.key, settledLocation.key, fallback])

  const timeout =
    activePlan.duration > 0 ? { enter: activePlan.duration, exit: activePlan.duration } : 0

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    if (activePlan.duration <= 0) {
      commitSettled()
      return
    }
    const timer = window.setTimeout(commitSettled, activePlan.duration + 50)
    return () => window.clearTimeout(timer)
  }, [location.key, activePlan.duration, settledLocation.key, commitSettled])

  type StackEntry = {
    locKey: string
    // stableKey is derived from layoutRouteId (same for home/profile, different for article).
    // Used as the Activity React key so same-level navigations (tabs, REPLACE) don't
    // unmount the subtree — only the outlet/locCtx/locKey are updated in-place.
    stableKey: string
    outlet: ReactNode
    locCtx: unknown
    nodeRef: RefObject<HTMLDivElement | null>
    alive: boolean
    activityMode: 'visible' | 'hidden'
    // When true, skip the CSSTransition enter animation on POP restore.
    // The exiting page slides away on top (via DOM order); background reveals without animating.
    skipEnter?: boolean
  }

  // nodeRefsCache and bgScrollsRef are keyed by stableKey (stable across same-level nav).
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
  // stableKey groups same-level pages: combines layout route ID with path depth so that
  // home/profile (same depth) share one stableKey while list/detail (different depths) don't.
  // Used as the Activity React key — stable across same-level navigations (tabs, replace),
  // different for genuinely deeper pages (detail pushed on top of list).
  const stableKey = `${pageKey}_${location.pathname.split('/').filter(Boolean).length}`
  const topEntry = stackRef.current[stackRef.current.length - 1] as StackEntry | undefined

  if (!topEntry) {
    stackRef.current = [
      { locKey, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
    ]
  } else if (topEntry.locKey !== locKey) {
    if (navType === 'POP') {
      // Look up by locKey (browser history key), which was updated on each same-level nav.
      const stack = stackRef.current
      let bgIdx = -1
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].locKey === locKey) { bgIdx = i; break }
      }
      if (bgIdx >= 0) {
        const below = stackRef.current.slice(0, bgIdx)
        const poppedOff = stackRef.current.slice(bgIdx + 1).map(e => ({ ...e, alive: false }))
        const restored: StackEntry = { ...stackRef.current[bgIdx], outlet, locCtx, activityMode: 'visible', skipEnter: true }
        stackRef.current = [...below, ...poppedOff, restored]
        if (bgScrollsRef.current.has(restored.stableKey)) {
          pendingScrollRestoreRef.current.add(restored.stableKey)
        }
      } else {
        // Target not found in back-stack (jumped back multiple levels or same-level nav after
        // stableKey update). Reset — the Activity key (stableKey) may be the same, so React
        // will reconcile without unmounting if it matches.
        for (const e of stackRef.current) {
          nodeRefsCache.current.delete(e.stableKey)
          bgScrollsRef.current.delete(e.stableKey)
        }
        stackRef.current = [
          { locKey, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
        ]
      }
    } else if (topEntry.stableKey === stableKey) {
      // Same-level navigation (tabs REPLACE, sibling PUSH with same depth): same stableKey
      // means the Activity key won't change — no DOM unmount. Just update locKey/outlet/locCtx.
      stackRef.current = stackRef.current.map((e, i, arr) =>
        i === arr.length - 1 ? { ...e, locKey, outlet, locCtx } : e,
      )
    } else if (navType === 'PUSH') {
      // True stack push: navigating to a different depth/layout page (different stableKey).
      // Hide all entries below the current top (which becomes second after PUSH) so they
      // don't show through during the animation and don't waste render budget.
      const updatedStack = stackRef.current.map((e, i, arr) =>
        i < arr.length - 1 ? { ...e, activityMode: 'hidden' as const } : e,
      )
      // Filter out zombie entries (alive=false) with the same stableKey. These are left
      // behind after a POP and would create duplicate React keys if not removed before PUSH.
      const deduped = updatedStack.filter(e => !(e.stableKey === stableKey && !e.alive))
      stackRef.current = [
        ...deduped,
        { locKey, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
      ]
      // Two-render trick: first paint with in={false} so CSSTransition starts in
      // "exited" state; useLayoutEffect then flips to in={true} to play the enter animation.
      pendingEnterRef.current.add(stableKey)
    } else {
      // REPLACE with a different stableKey: swap top entry.
      const replaced = stackRef.current[stackRef.current.length - 1]
      if (replaced) {
        nodeRefsCache.current.delete(replaced.stableKey)
        bgScrollsRef.current.delete(replaced.stableKey)
      }
      stackRef.current = [
        ...stackRef.current.slice(0, -1),
        { locKey, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
      ]
      // Same two-render trick as PUSH so the entering page's CSSTransition starts in
      // "exited" state and the enter animation plays correctly.
      pendingEnterRef.current.add(stableKey)
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
    if (pendingScrollRestoreRef.current.size > 0) {
      pendingScrollRestoreRef.current.forEach((sk) => {
        const saved = bgScrollsRef.current.get(sk)
        const container = nodeRefsCache.current.get(sk)?.current
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
    }
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
        // Restored background entries (POP) appear immediately: Activity's hidden→visible
        // transition causes CSSTransition to skip to "entered" (effects re-run), so we
        // use timeout=0 to match. The exiting page slides away on top via DOM order.
        const skipEnter = isTop && entry.skipEnter === true
        // Only the top two entries animate; deeper entries stay hidden via Activity.
        const entryTimeout = skipEnter ? 0 : (isTop || isSecond ? timeout : 0)
        const entryClassNames = skipEnter ? {} : (isTop || isSecond ? activePlan.classNames : {})
        // First paint with in={false}; useLayoutEffect then flips to in={true}.
        const inProp = isTop && !pendingEnterRef.current.has(entry.stableKey)
        return (
          <Activity key={entry.stableKey} mode={entry.activityMode}>
            <CSSTransition
              nodeRef={entry.nodeRef}
              in={inProp}
              timeout={entryTimeout}
              classNames={entryClassNames}
              mountOnEnter={false}
              unmountOnExit={!entry.alive}
              onExited={() => {
                // Look up the entry's current alive status from stackRef (not the render closure)
                // to avoid stale values when rapid navigation re-activates the page before its
                // exit animation finishes.
                const stableKey = entry.stableKey
                const current = stackRef.current.find(e => e.stableKey === stableKey)
                if (!current || !current.alive) {
                  stackRef.current = stackRef.current.filter(e => e.stableKey !== stableKey)
                  nodeRefsCache.current.delete(stableKey)
                  bgScrollsRef.current.delete(stableKey)
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
                    bgScrollsRef.current.set(stableKey, scrollables)
                  }
                  stackRef.current = stackRef.current.map(e =>
                    e.stableKey === stableKey ? { ...e, activityMode: 'hidden' as const } : e,
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

/** Returns true if `pathname` matches the given filter. */
function matchFilter(pathname: string, filter: KeepAliveFilter): boolean {
  if (Array.isArray(filter)) return filter.includes(pathname)
  if (filter instanceof RegExp) return filter.test(pathname)
  return filter(pathname)
}

/**
 * Returns true if the page at `pathname` should be kept in the Activity cache.
 * When `include` is set, only matching pages are cached.
 * When `exclude` is set, matching pages are discarded on exit.
 * If neither is set, all pages are cached.
 */
function shouldCache(pathname: string, include: KeepAliveFilter | undefined, exclude: KeepAliveFilter | undefined): boolean {
  if (include !== undefined && !matchFilter(pathname, include)) return false
  if (exclude !== undefined && matchFilter(pathname, exclude)) return false
  return true
}

/**
 * Implements `keepAlive={true}` for `<AnimatedOutlet>`.
 *
 * Each unique pathname is cached via `<Activity>`. The active page is
 * `mode="visible"`; all others are `mode="hidden"` (display:none). React state
 * is preserved across switches; Effects are cleaned up while hidden.
 *
 * When `layoutTransition` is set, a CSSTransition plays enter/exit animations.
 * Activity mode is deferred to "hidden" only after the exit animation completes,
 * so the page remains visible during its slide/fade out.
 *
 * `display:none` resets scrollTop for nested overflow containers, so scroll
 * positions are tracked via capture-phase listeners and restored in useLayoutEffect.
 *
 * Known limitation: video/audio elements pause when hidden, and iframes may
 * reload — this is a browser-level consequence of display:none.
 */
function KeepAliveRoot({
  max,
  include,
  exclude,
  aliveRef,
  layoutTransition,
  className,
}: {
  max?: number
  include?: KeepAliveFilter
  exclude?: KeepAliveFilter
  aliveRef?: RefObject<KeepAliveRef | undefined>
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const location = useLocation()
  const navType = useNavigationType()
  const matches = useMatches()
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

  // Per-page Activity mode (deferred to 'hidden' after exit animation finishes).
  const activityModesRef = useRef(new Map<string, 'visible' | 'hidden'>())
  // Per-page nodeRef for CSSTransition.
  const nodeRefsRef = useRef(new Map<string, RefObject<HTMLDivElement | null>>())
  const getKARNodeRef = useCallback((key: string): RefObject<HTMLDivElement | null> => {
    if (!nodeRefsRef.current.has(key)) {
      nodeRefsRef.current.set(key, createRef<HTMLDivElement | null>())
    }
    return nodeRefsRef.current.get(key)!
  }, [])
  // Two-render trick for enter animation.
  const pendingEnterRef = useRef(new Set<string>())

  const scrollCacheRef = useRef(new Map<string, Array<[HTMLElement, number, number]>>())

  // Compute transition plan (same as AnimatedRoot for switch mode).
  const fromSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const toSnapRef = useRef<RouteSnapshot>(snap(location, matches))
  const lastToKeyRef = useRef(location.key)
  if (lastToKeyRef.current !== location.key) {
    fromSnapRef.current = toSnapRef.current
    lastToKeyRef.current = location.key
    toSnapRef.current = snap(location, matches)
  }
  const [settledLocation, setSettledLocation] = useState(location)
  const locationRef = useRef(location)
  locationRef.current = location
  const settledKeyRef = useRef(settledLocation.key)
  settledKeyRef.current = settledLocation.key
  const commitSettled = useCallback(() => {
    if (settledKeyRef.current !== locationRef.current.key) setSettledLocation(locationRef.current)
  }, [])

  const fallback = layoutTransition ?? 'none'
  const activePlan: TransitionPlan = useMemo(() => {
    if (!layoutTransition) return IDLE
    const fromSnap = fromSnapRef.current
    const toSnap = toSnapRef.current
    // Treat all switch navigations as REPLACE (no stack history).
    const effectiveNav = navType === 'PUSH' && fromSnap.path !== toSnap.path ? 'REPLACE' : navType
    return planTransition(effectiveNav, fromSnap, toSnap, fallback, { tabs: true })
  }, [layoutTransition, navType, location.key, settledLocation.key, fallback])

  const timeout =
    activePlan.duration > 0 ? { enter: activePlan.duration, exit: activePlan.duration } : 0

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    if (activePlan.duration <= 0) {
      // Always sync settledLocation even when same pathname (different key).
      // Skipping this caused fromSnapRef to go stale after rapid A→B→A navigation,
      // which in turn produced wrong animation directions on subsequent navigations.
      commitSettled()
      return
    }
    const timer = window.setTimeout(commitSettled, activePlan.duration + 50)
    return () => window.clearTimeout(timer)
  }, [location.key, activePlan.duration, settledLocation.key, commitSettled])

  snapshotsRef.current.set(pageKey, { outlet, locCtx })

  // Track whether the active page changed so we know when to apply the two-render trick.
  const prevPageKeyRef = useRef('')
  const isPageKeyChanged = prevPageKeyRef.current !== pageKey
  prevPageKeyRef.current = pageKey

  // Move current key to tail (most-recently-used).
  if (keysRef.current.includes(pageKey)) {
    keysRef.current = keysRef.current.filter((k) => k !== pageKey)
  }
  keysRef.current = [...keysRef.current, pageKey]

  // Make the new page Activity visible immediately (needed before enter animation).
  activityModesRef.current.set(pageKey, 'visible')

  if (isPageKeyChanged) {
    // Two-render trick: start with in=false so CSSTransition starts in "exited" state.
    // Apply to ALL page switches (new pages and cached pages returning from Activity hidden)
    // so enter and exit animations always start simultaneously on the second render.
    pendingEnterRef.current.add(pageKey)
  }

  if (max !== undefined && keysRef.current.length > max) {
    const evicted = keysRef.current.slice(0, keysRef.current.length - max)
    keysRef.current = keysRef.current.slice(keysRef.current.length - max)
    for (const k of evicted) {
      snapshotsRef.current.delete(k)
      scrollCacheRef.current.delete(k)
      activityModesRef.current.delete(k)
      nodeRefsRef.current.delete(k)
    }
  }

  // Capture-phase scroll listener on each page container.
  useLayoutEffect(() => {
    const cleanups: Array<() => void> = []
    nodeRefsRef.current.forEach((ref, key) => {
      const container = ref.current
      if (!container) return
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

  // Restore scroll after Activity removes display:none.
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

  // Two-render trick: flip pendingEnter → triggers enter animation.
  useLayoutEffect(() => {
    if (pendingEnterRef.current.size > 0) {
      pendingEnterRef.current.clear()
      forceRender()
    }
  })

  // Rapid-nav cleanup: when an animation is interrupted (duration=0, e.g. rapid A→B→A),
  // immediately hide all non-active pages that are still visible. This prevents the
  // one-frame flash that occurs when CSSTransition removes animation classes from an
  // interrupted page, causing it to snap back to position 0 before Activity hides it.
  // Runs before browser paint (useLayoutEffect) so the flash is never visible.
  useLayoutEffect(() => {
    if (activePlan.duration > 0) return
    let changed = false
    activityModesRef.current.forEach((mode, key) => {
      if (key !== pageKey && mode === 'visible') {
        if (!shouldCache(key, include, exclude)) {
          keysRef.current = keysRef.current.filter((k) => k !== key)
          snapshotsRef.current.delete(key)
          scrollCacheRef.current.delete(key)
          activityModesRef.current.delete(key)
          nodeRefsRef.current.delete(key)
        } else {
          activityModesRef.current.set(key, 'hidden')
        }
        changed = true
      }
    })
    if (changed) forceRender()
  })

  useLayoutEffect(() => {
    if (!aliveRef) return
    aliveRef.current = {
      remove(pathname) {
        if (pathname === pageKeyRef.current) return
        snapshotsRef.current.delete(pathname)
        keysRef.current = keysRef.current.filter((k) => k !== pathname)
        scrollCacheRef.current.delete(pathname)
        activityModesRef.current.delete(pathname)
        nodeRefsRef.current.delete(pathname)
        forceRender()
      },
      removeAll() {
        const active = pageKeyRef.current
        for (const k of [...keysRef.current]) {
          if (k !== active) {
            snapshotsRef.current.delete(k)
            scrollCacheRef.current.delete(k)
            activityModesRef.current.delete(k)
            nodeRefsRef.current.delete(k)
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
        const pageSnap = snapshotsRef.current.get(key)!
        const isActive = key === pageKey
        const activityMode = activityModesRef.current.get(key) ?? 'visible'
        const nodeRef = getKARNodeRef(key)
        // First paint of new page uses in=false; useLayoutEffect flips to in=true.
        const isPendingEnter = pendingEnterRef.current.has(key)
        const inProp = isActive && !isPendingEnter
        // While a page is pending its enter animation (in=false), it's visible in the DOM
        // at its default position (transform: 0). Apply the pre-enter position class from
        // classNames.enter so it starts off-screen (e.g. translate3d(100%, 0, 0)).
        // This prevents the one-frame flash at position 0 before the animation begins.
        // React 18 useLayoutEffect → forceRender runs synchronously before browser paint,
        // so the page is at the correct off-screen position by the time the browser paints.
        const preEnterClass = isPendingEnter ? extractPreEnterClass(activePlan.classNames.enter) : ''
        return (
          <Activity key={key} mode={activityMode}>
            <CSSTransition
              nodeRef={nodeRef}
              in={inProp}
              timeout={timeout}
              classNames={activePlan.classNames}
              mountOnEnter={false}
              unmountOnExit={false}
              onExited={() => {
                // Use ref instead of closure `isActive` to avoid stale value when the
                // page becomes active again before its exit animation finishes (e.g. rapid B→A→B).
                if (key !== pageKeyRef.current) {
                  if (!shouldCache(key, include, exclude)) {
                    // Non-cacheable: remove entirely so next visit re-mounts fresh.
                    keysRef.current = keysRef.current.filter((k) => k !== key)
                    snapshotsRef.current.delete(key)
                    scrollCacheRef.current.delete(key)
                    activityModesRef.current.delete(key)
                    nodeRefsRef.current.delete(key)
                  } else {
                    // Delay Activity hidden until after exit animation to avoid display:none clipping.
                    activityModesRef.current.set(key, 'hidden')
                  }
                  forceRender()
                }
              }}
            >
              <div ref={nodeRef} className={preEnterClass ? `animated-outlet-page ${preEnterClass}` : 'animated-outlet-page'}>
                <PageActiveContext.Provider value={pageKey}>
                  <UNSAFE_LocationContext.Provider value={pageSnap.locCtx as never}>
                    {pageSnap.outlet}
                  </UNSAFE_LocationContext.Provider>
                </PageActiveContext.Provider>
              </div>
            </CSSTransition>
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
  layoutTransition,
  className,
}: {
  depth: number
  mode?: OutletMode
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const mode = resolveOutletMode(modeProp, matches, location.state)
  const tabs = mode === 'switch'
  const fallback = layoutTransition ?? (tabs ? 'none' : 'cover')
  const pageKey = pageTransitionKey(mode, matches, location.pathname, location.key)

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
    fromSnapRef.current = toSnapRef.current
    lastToKeyRef.current = location.key
    toSnapRef.current = snap(location, matches)
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

  // Track the stablePageKey from the last settled location so we can detect when
  // TransitionGroup won't animate (same key for old and new location). In that case
  // the outlet must stay live: switching FrozenOutlet→live would unmount inner BPRs.
  const settledStablePageKeyRef = useRef(stablePageKey)
  if (settledLocation.key === location.key) {
    settledStablePageKeyRef.current = stablePageKey
  }
  const liveOutlet = activePlan.duration <= 0 || stablePageKey === settledStablePageKeyRef.current

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
  keepAlive: keepAliveProp,
  max,
  include,
  exclude,
  aliveRef,
  mode,
  className,
  children,
}: AnimatedOutletProps) {
  const depth = useContext(DepthContext)
  const matches = useMatches()
  const location = useLocation()

  // Props take precedence over route handle flags.
  const keepAlive = keepAliveProp ?? matches.some((m) => {
    const h = m.handle as Record<string, unknown> | null | undefined
    // keepBackground is an alias for keepAlive (backward compat for handle-based config).
    return h?.keepAlive === true || h?.keepBackground === true
  })

  if (children !== undefined && transition !== undefined) {
    return <PageScope transition={transition}>{children}</PageScope>
  }

  if (keepAlive) {
    const effectiveMode = resolveOutletMode(mode, matches, location.state)
    if (effectiveMode === 'switch') {
      // Switch mode: all pages cached by pathname, instant Activity show/hide.
      return (
        <DepthContext.Provider value={depth + 1}>
          {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
          <KeepAliveRoot max={max} include={include} exclude={exclude} aliveRef={aliveRef} layoutTransition={transition} className={className} />
        </DepthContext.Provider>
      )
    }
    // Stack mode: animated push/pop with background page preserved.
    return (
      <DepthContext.Provider value={depth + 1}>
        {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
        <BackgroundPreserveRoot depth={depth} layoutTransition={transition} className={className} />
      </DepthContext.Provider>
    )
  }

  return (
    <DepthContext.Provider value={depth + 1}>
      {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
      <AnimatedRoot depth={depth} mode={mode} layoutTransition={transition} className={className} />
    </DepthContext.Provider>
  )
}

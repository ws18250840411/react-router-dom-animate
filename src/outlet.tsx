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
  type Context,
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
  /**
   * Animation type for route transitions. Falls back to the nearest layout scope
   * or `'cover'` for stack mode, `'none'` for switch mode.
   */
  transition?: RouteAnimType
  /**
   * Navigation mode for non-keepAlive outlets:
   * - `'stack'` (default): uses PUSH/POP direction for slide animations.
   * - `'switch'`: treats all navigations as REPLACE (tab-like, no directional animation).
   *
   * When inside `<KeepAlive>`, an explicitly supplied value overrides the inherited
   * mode for this outlet. This is useful for a root stack cache with an instant
   * nested tab outlet.
   */
  mode?: OutletMode
  className?: string
  children?: ReactNode
}

// Infer the value type of UNSAFE_LocationContext (LocationContextObject is
// not exported by react-router). Used to type locCtx without `as never`.
type LocCtxValue = (typeof UNSAFE_LocationContext) extends Context<infer V> ? V : never

/**
 * Wraps `UNSAFE_LocationContext.Provider` to freeze the exiting page's location
 * context during exit animations. If `UNSAFE_LocationContext` is removed in a
 * future React Router version, replace this with a passthrough:
 *
 *   function LocationContextProvider({ children }) { return <>{children}</> }
 *
 * The only impact of a passthrough is that exit animations may briefly show the
 * new route's content (visual glitch), not a hard crash.
 */
function LocationContextProvider({ value, children }: { value: LocCtxValue; children: ReactNode }) {
  return <UNSAFE_LocationContext.Provider value={value}>{children}</UNSAFE_LocationContext.Provider>
}

const DepthContext = createContext(0)
// Signals that this subtree is inside an alive=false (exiting) BackgroundPreserveRoot entry.
// Nested BackgroundPreserveRoots must not update their outlet/locCtx while frozen.
const FrozenContext = createContext(false)

interface KeepAliveContextValue {
  mode: OutletMode
  maxRef: RefObject<number | undefined>
  // include/exclude are stored as refs so the context value stays stable
  // even when the user passes inline functions that change on every render.
  includeRef: RefObject<KeepAliveFilter | undefined>
  excludeRef: RefObject<KeepAliveFilter | undefined>
  aliveRef?: RefObject<KeepAliveRef | null | undefined>
}

const KeepAliveContext = createContext<KeepAliveContextValue | null>(null)

export interface KeepAliveProps {
  /**
   * Caching strategy for child routes rendered by `<AnimatedOutlet>`.
   *
   * - **`'stack'`** (default): list → detail → back navigation. The background page
   *   is preserved in the DOM and scroll position is restored when the user pops back.
   * - **`'switch'`**: tab / bottom-nav navigation. All visited pages are kept in an
   *   LRU cache and shown / hidden instantly when switching tabs.
   */
  mode?: OutletMode
  /**
   * Maximum number of pages to keep in cache simultaneously (LRU eviction).
   * Only applies when `mode="switch"`. Defaults to 30.
   */
  max?: number
  /**
   * Allow-list: only pathnames matching this filter are cached.
   * Pages not matched are still rendered while active but discarded on exit.
   * Only applies when `mode="switch"`.
   */
  include?: KeepAliveFilter
  /**
   * Deny-list: pathnames matching this filter are NOT cached (evicted on exit).
   * Only applies when `mode="switch"`.
   */
  exclude?: KeepAliveFilter
  /**
   * Imperative handle for cache control. Only applies when `mode="switch"`.
   * After mount, `aliveRef.current` exposes `remove`, `removeAll`, and `getCached`.
   *
   * @example
   * const aliveRef = useRef<KeepAliveRef | undefined>(undefined)
   * <KeepAlive mode="switch" aliveRef={aliveRef}>
   *   <AnimatedOutlet />
   * </KeepAlive>
   * aliveRef.current?.remove('/home')
   */
  aliveRef?: RefObject<KeepAliveRef | null | undefined>
  children: ReactNode
}

/**
 * Enables page caching for the `<AnimatedOutlet>` nested inside.
 *
 * Wrap the outlet that needs caching — the page that should be preserved will
 * stay mounted in the DOM using React's `<Activity>` component.
 *
 * @example
 * // Tab / bottom-nav: cache all visited tabs (switch mode)
 * <KeepAlive mode="switch">
 *   <AnimatedOutlet transition="cover" />
 * </KeepAlive>
 *
 * @example
 * // List → detail → back: preserve background page (stack mode, default)
 * <KeepAlive>
 *   <AnimatedOutlet transition="cover" />
 * </KeepAlive>
 */
export function KeepAlive({ children, mode = 'stack', max, include, exclude, aliveRef }: KeepAliveProps) {
  // Stable refs for include/exclude so the context value is not recreated when
  // the user passes inline functions (which would otherwise change reference on
  // every parent render and cause all AnimatedOutlet consumers to re-render).
  const includeRef = useRef<KeepAliveFilter | undefined>(include)
  const excludeRef = useRef<KeepAliveFilter | undefined>(exclude)
  const maxRef = useRef<number | undefined>(max)
  includeRef.current = include
  excludeRef.current = exclude
  maxRef.current = max

  const ctxValue = useMemo<KeepAliveContextValue>(
    // includeRef / excludeRef are stable (same object every render), so they
    // do not need to be in the dep array — only primitive/stable values do.
    () => ({ mode, maxRef, includeRef, excludeRef, aliveRef }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, aliveRef],
  )
  return <KeepAliveContext.Provider value={ctxValue}>{children}</KeepAliveContext.Provider>
}

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
    // Store reference directly - React Router creates a new matches array
    // per location change, so from/to never alias. Avoids O(n) copy per nav.
    matches,
  }
}

function PageScope({ transition, children }: { transition: RouteAnimType; children: ReactNode }) {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    registerPageAnim(pathname, transition)
    return () => unregisterPageAnim(pathname, transition)
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
function FrozenOutlet({ outlet, locCtx }: { outlet: ReactNode; locCtx: LocCtxValue }) {
  const [frozen] = useState(outlet)
  const [frozenCtx] = useState(locCtx)
  return (
    <LocationContextProvider value={frozenCtx}>{frozen}</LocationContextProvider>
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
  locCtx: LocCtxValue
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
          <LocationContextProvider value={locCtx}>{outlet}</LocationContextProvider>
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
 * `display:none` resets scrollTop for nested overflow containers. Scroll positions are
 * tracked via capture-phase listeners (outside Activity, like `KeepAliveRoot`) so the
 * last recorded value is always the position just before the page went hidden. Restored
 * in `useLayoutEffect` after Activity makes the page visible again.
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
    locCtx: LocCtxValue
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

  // Scroll positions are tracked via capture-phase scroll listeners (keyed by stableKey).
  //
  // iOS-specific concern: momentum scroll continues on the compositor thread while the exit
  // animation plays (the outgoing page is still Activity-visible during the animation). This
  // can shift scrollTop from the user's intended position (877) to an intermediate value (310)
  // by the time the page is hidden — even though the user never scrolled to 310 intentionally.
  //
  // Solution: capture-phase touchstart fires synchronously before any React processing. iOS
  // stops momentum scroll the instant the user's finger touches the screen, so the scrollTop
  // at touchstart is the correct "intended" resting position. We snapshot bgScrollsRef at that
  // moment and freeze updates for 100 ms after touchend, giving the click/navigate event time
  // to fire before unfreezing. This ensures bgScrollsRef always holds the pre-navigation
  // position when a POP restoration runs.
  const bgScrollsRef = useRef(new Map<string, Array<[HTMLElement, number, number]>>())
  const bgScrollHandlersRef = useRef(new Map<string, {
    handler: (event: Event) => void
    clickHandler: () => void
    touchStartHandler: () => void
    touchEndHandler: () => void
    container: HTMLElement
  }>())
  const bgFrozenRef = useRef(new Map<string, boolean>())
  const bgInteractionFrozenRef = useRef(new Set<string>())
  // Once a page starts leaving, ignore browser-generated scroll events until it
  // is restored. Some engines reset descendant scrollTop when Activity applies
  // display:none; that reset must never overwrite the pre-navigation snapshot.
  const bgNavigationFrozenRef = useRef(new Set<string>())
  const pendingScrollRestoreRef = useRef(new Set<string>())
  const scrollRestoreFrameRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (scrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current)
    }
    // Detach all scroll/touch handlers on unmount to prevent stale listeners
    // if DOM nodes are reused by React reconciliation.
    for (const key of [...bgScrollHandlersRef.current.keys()]) {
      detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, key)
    }
  }, [])

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
      // Data-router loaders and redirects may replace a history entry while
      // preserving the same logical page. Fall back to the scoped page identity
      // so POP can still reactivate the existing Activity subtree.
      if (bgIdx < 0) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].stableKey === stableKey && stack[i].alive) { bgIdx = i; break }
        }
      }
      if (bgIdx >= 0) {
        const below = stackRef.current.slice(0, bgIdx)
        const poppedOff = stackRef.current.slice(bgIdx + 1).map(e => ({ ...e, alive: false }))
        const restored: StackEntry = { ...stackRef.current[bgIdx], outlet, locCtx, activityMode: 'visible', skipEnter: true }
        stackRef.current = [...below, ...poppedOff, restored]
        if (bgScrollsRef.current.has(restored.stableKey)) {
          pendingScrollRestoreRef.current.add(restored.stableKey)
        } else {
          bgNavigationFrozenRef.current.delete(restored.stableKey)
        }
      } else {
        // Target not found in back-stack (jumped back multiple levels or same-level nav after
        // stableKey update). Reset — the Activity key (stableKey) may be the same, so React
        // will reconcile without unmounting if it matches.
        for (const e of stackRef.current) {
          detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, e.stableKey)
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
      // Refresh once at the navigation boundary when layout still exposes a
      // non-zero position. The click-capture freeze preserves the earlier event
      // snapshot when nested route rendering has already collapsed the layout.
      // This O(DOM nodes) scan runs on PUSH only, never during scrolling.
      if (!bgFrozenRef.current.get(topEntry.stableKey)) {
        const container = topEntry.nodeRef.current
        if (container) {
          const existing = bgScrollsRef.current.get(topEntry.stableKey)
          if (existing && existing.length > 0) {
            // Update existing scroll positions in O(tracked elements) instead of
            // O(all DOM nodes). The scroll listener already tracks every element
            // that has actually scrolled, so we only need to refresh their values.
            for (let i = existing.length - 1; i >= 0; i--) {
              const el = existing[i][0]
              if (!el.isConnected) { existing.splice(i, 1); continue }
              existing[i] = [el, el.scrollTop, el.scrollLeft]
            }
          } else {
            // First PUSH with no prior scroll events: full scan to discover all
            // elements with non-zero scroll (e.g. programmatic scrollTop).
            const scrolls: Array<[HTMLElement, number, number]> = []
            const elements = [container, ...container.querySelectorAll<HTMLElement>('*')]
            for (const element of elements) {
              if (element.scrollTop !== 0 || element.scrollLeft !== 0) {
                scrolls.push([element, element.scrollTop, element.scrollLeft])
              }
            }
            if (scrolls.length > 0) bgScrollsRef.current.set(topEntry.stableKey, scrolls)
          }
        }
      }
      bgNavigationFrozenRef.current.add(topEntry.stableKey)
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
        detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, replaced.stableKey)
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

  // Attach/detach scroll + touch listeners for alive stack entries (capture phase, outside Activity).
  // Runs on every render so newly pushed entries get listeners immediately.
  // The touchstart handler snapshots and freezes bgScrollsRef at the moment iOS stops momentum
  // (the "intended" scroll position), preventing the animation-phase momentum scroll from
  // overwriting it with an intermediate value before the page is hidden.
  useLayoutEffect(() => {
    nodeRefsCache.current.forEach((ref, key) => {
      const container = ref.current
      if (!container || bgScrollHandlersRef.current.has(key)) return

      // Use event.target (O(1)) instead of querySelectorAll('*') (O(total DOM nodes)).
      // The scroll event's target is exactly the element that scrolled, so we only
      // read/update that one element rather than scanning the whole subtree on every frame.
      const handler = (event: Event) => {
        if (bgFrozenRef.current.get(key) || bgInteractionFrozenRef.current.has(key) || bgNavigationFrozenRef.current.has(key)) return
        const el = event.target as HTMLElement | null
        if (!el) return
        let cache = bgScrollsRef.current.get(key)
        if (!cache) {
          if (el.scrollTop === 0 && el.scrollLeft === 0) return
          cache = []
          bgScrollsRef.current.set(key, cache)
        }
        const idx = cache.findIndex(([e]) => e === el)
        if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
          if (idx >= 0) {
            cache[idx] = [el, el.scrollTop, el.scrollLeft]
          } else {
            cache.push([el, el.scrollTop, el.scrollLeft])
          }
        } else if (idx >= 0) {
          cache.splice(idx, 1)
        }
      }
      const touchStartHandler = () => {
        // iOS stops momentum scroll at touchstart. Re-read the current position of every
        // already-tracked element — this captures the settled value without a querySelectorAll.
        // Then freeze so animation-phase momentum events can't overwrite the correct value.
        const cache = bgScrollsRef.current.get(key)
        if (cache?.length) {
          for (let i = cache.length - 1; i >= 0; i--) {
            const el = cache[i][0]
            if (!el.isConnected) { cache.splice(i, 1); continue }
            cache[i] = [el, el.scrollTop, el.scrollLeft]
          }
          bgScrollsRef.current.set(key, cache.filter(([, t, l]) => t !== 0 || l !== 0))
        }
        bgFrozenRef.current.set(key, true)
      }
      const touchEndHandler = () => {
        // Unfreeze after 100 ms so click/navigate has time to fire first.
        window.setTimeout(() => bgFrozenRef.current.delete(key), 100)
      }
      const clickHandler = () => {
        bgInteractionFrozenRef.current.add(key)
        window.setTimeout(() => bgInteractionFrozenRef.current.delete(key), 0)
      }

      container.addEventListener('scroll', handler, { capture: true, passive: true })
      container.addEventListener('click', clickHandler, { capture: true })
      container.addEventListener('touchstart', touchStartHandler, { capture: true, passive: true })
      container.addEventListener('touchend', touchEndHandler, { capture: true, passive: true })
      container.addEventListener('touchcancel', touchEndHandler, { capture: true, passive: true })
      bgScrollHandlersRef.current.set(key, { handler, clickHandler, touchStartHandler, touchEndHandler, container })
    })
    // Detach listeners for entries that are no longer in the cache.
    bgScrollHandlersRef.current.forEach((_, key) => {
      if (!nodeRefsCache.current.has(key)) {
        detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, key)
      }
    })
  })

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
          const restore = () => {
            for (const [el, top, left] of saved) {
              if (!el.isConnected) continue
              el.scrollTop = top
              el.scrollLeft = left
            }
          }
          restore()
          if (scrollRestoreFrameRef.current !== null) {
            window.cancelAnimationFrame(scrollRestoreFrameRef.current)
          }
          scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
            scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
              scrollRestoreFrameRef.current = null
              const current = stackRef.current[stackRef.current.length - 1]
              if (current?.stableKey === sk && current.activityMode === 'visible') restore()
            })
          })
        }
        bgNavigationFrozenRef.current.delete(sk)
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
        const entryClassNames = skipEnter ? IDLE.classNames : (isTop || isSecond ? activePlan.classNames : IDLE.classNames)
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
                  detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, stableKey)
                  stackRef.current = stackRef.current.filter(e => e.stableKey !== stableKey)
                  nodeRefsCache.current.delete(stableKey)
                  bgScrollsRef.current.delete(stableKey)
                  forceRender()
                } else {
                  // bgScrollsRef already has the correct pre-navigation position (captured at
                  // touchstart). Now just hide via Activity — scrollTop will reset to 0 via
                  // display:none and be restored from bgScrollsRef on the next POP.
                  stackRef.current = stackRef.current.map(e =>
                    e.stableKey === stableKey ? { ...e, activityMode: 'hidden' as const } : e,
                  )
                  forceRender()
                }
              }}
            >
              <div ref={entry.nodeRef} className="animated-outlet-page">
                {entry.alive ? (
                  <LocationContextProvider value={entry.locCtx}>
                    {entry.outlet}
                  </LocationContextProvider>
                ) : (
                  // Freeze outlet inside exiting entries so nested BackgroundPreserveRoots
                  // don't replace the exiting content with the new route's outlet.
                  <FrozenContext.Provider value={true}>
                    <LocationContextProvider value={entry.locCtx}>
                      {entry.outlet}
                    </LocationContextProvider>
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

function routeCacheName(matches: UIMatch[]): string | undefined {
  for (let index = matches.length - 1; index >= 0; index--) {
    const name = (matches[index]?.handle as { keepAliveName?: unknown } | undefined)?.keepAliveName
    if (typeof name === 'string') return name
  }
  return undefined
}

/** Returns true if pathname or route cache name matches the given filter. */
function matchFilter(pathname: string, filter: KeepAliveFilter, cacheName?: string): boolean {
  if (filter instanceof RegExp) {
    // Clone without the global flag to avoid lastIndex statefulness.
    const re = new RegExp(filter.source, filter.flags.replace('g', ''))
    return re.test(pathname) || (cacheName !== undefined && re.test(cacheName))
  }
  if (typeof filter === 'function') return filter(pathname, cacheName)
  return filter.includes(pathname) || (cacheName !== undefined && filter.includes(cacheName))
}

/**
 * Returns true if the page at `pathname` should be kept in the Activity cache.
 * When `include` is set, only matching pages are cached.
 * When `exclude` is set, matching pages are discarded on exit.
 * If neither is set, all pages are cached.
 */
function shouldCache(
  pathname: string,
  include: KeepAliveFilter | undefined,
  exclude: KeepAliveFilter | undefined,
  cacheName?: string,
): boolean {
  if (include !== undefined && !matchFilter(pathname, include, cacheName)) return false
  if (exclude !== undefined && matchFilter(pathname, exclude, cacheName)) return false
  return true
}

/** Remove scroll + touch listeners added by KeepAliveRoot, if any. */
function detachScrollHandler(
  scrollHandlers: Map<string, { handler: (event: Event) => void; container: HTMLElement }>,
  key: string,
): void {
  const entry = scrollHandlers.get(key)
  if (entry) {
    entry.container.removeEventListener('scroll', entry.handler, { capture: true })
    scrollHandlers.delete(key)
  }
}

/** Remove scroll + touch listeners added by BackgroundPreserveRoot, if any. */
function detachBgScrollHandler(
  bgScrollHandlers: Map<string, { handler: (event: Event) => void; clickHandler: () => void; touchStartHandler: () => void; touchEndHandler: () => void; container: HTMLElement }>,
  bgFrozen: Map<string, boolean>,
  bgInteractionFrozen: Set<string>,
  bgNavigationFrozen: Set<string>,
  key: string,
): void {
  const entry = bgScrollHandlers.get(key)
  if (entry) {
    entry.container.removeEventListener('scroll', entry.handler, { capture: true })
    entry.container.removeEventListener('click', entry.clickHandler, { capture: true })
    entry.container.removeEventListener('touchstart', entry.touchStartHandler, { capture: true })
    entry.container.removeEventListener('touchend', entry.touchEndHandler, { capture: true })
    entry.container.removeEventListener('touchcancel', entry.touchEndHandler, { capture: true })
    bgScrollHandlers.delete(key)
  }
  bgFrozen.delete(key)
  bgInteractionFrozen.delete(key)
  bgNavigationFrozen.delete(key)
}

/**
 * Implements the switch-mode cache for `<KeepAlive mode="switch">`.
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
  max = 30,
  include,
  exclude,
  aliveRef,
  layoutTransition,
  className,
}: {
  max?: number
  include?: KeepAliveFilter
  exclude?: KeepAliveFilter
  aliveRef?: RefObject<KeepAliveRef | null | undefined>
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const location = useLocation()
  const navType = useNavigationType()
  const matches = useMatches()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const pageKey = location.pathname
  const cacheLimit = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 30

  type PageSnap = { outlet: ReactNode; locCtx: LocCtxValue; cacheName?: string }

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
  // Stable scroll handler entries: created once per cached page, removed when evicted.
  // Declared here (not near the useLayoutEffect that uses it) so it is available in the
  // render-body LRU eviction loop that runs before the useLayoutEffect declarations.
  const scrollHandlersRef = useRef(new Map<string, { handler: (event: Event) => void; container: HTMLElement }>())

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

  snapshotsRef.current.set(pageKey, { outlet, locCtx, cacheName: routeCacheName(matches) })

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

  if (keysRef.current.length > cacheLimit) {
    const evicted = keysRef.current.slice(0, keysRef.current.length - cacheLimit)
    keysRef.current = keysRef.current.slice(keysRef.current.length - cacheLimit)
    for (const k of evicted) {
      snapshotsRef.current.delete(k)
      scrollCacheRef.current.delete(k)
      activityModesRef.current.delete(k)
      nodeRefsRef.current.delete(k)
      detachScrollHandler(scrollHandlersRef.current, k)
    }
  }

  // Capture-phase scroll listener management: attach/detach only when the cached page set changes.
  // This is O(1) per render for stable caches instead of O(N) remove+add on every render.
  //
  // No cleanup return: listeners are managed explicitly (eviction-driven removal below and in
  // aliveRef.remove/removeAll/rapid-nav/onExited). DOM elements inside Activity are never replaced
  // by React (Activity uses display:none, not unmount/remount), so the captured `container`
  // reference stays valid for the page's lifetime.
  useLayoutEffect(() => {
    // Attach listeners for newly added pages.
    nodeRefsRef.current.forEach((ref, key) => {
      const container = ref.current
      if (!container || scrollHandlersRef.current.has(key)) return
      // Use event.target (O(1)) instead of querySelectorAll('*') (O(total DOM nodes)).
      // Incrementally track only the elements that have actually scrolled.
      const handler = (event: Event) => {
        const el = event.target as HTMLElement | null
        if (!el) return
        let cache = scrollCacheRef.current.get(key)
        if (!cache) {
          if (el.scrollTop === 0 && el.scrollLeft === 0) return
          cache = []
          scrollCacheRef.current.set(key, cache)
        }
        const idx = cache.findIndex(([e]) => e === el)
        if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
          if (idx >= 0) {
            cache[idx] = [el, el.scrollTop, el.scrollLeft]
          } else {
            cache.push([el, el.scrollTop, el.scrollLeft])
          }
        } else if (idx >= 0) {
          cache.splice(idx, 1)
        }
      }
      container.addEventListener('scroll', handler, { capture: true, passive: true })
      scrollHandlersRef.current.set(key, { handler, container })
    })
    // Detach listeners for any remaining evicted pages (safety net for paths that
    // don't call detachScrollHandler directly, e.g. future code changes).
    scrollHandlersRef.current.forEach(({ handler, container }, key) => {
      if (!nodeRefsRef.current.has(key)) {
        container.removeEventListener('scroll', handler, { capture: true })
        scrollHandlersRef.current.delete(key)
      }
    })
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
        if (!shouldCache(key, include, exclude, snapshotsRef.current.get(key)?.cacheName)) {
          detachScrollHandler(scrollHandlersRef.current, key)
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

  // Detach all scroll handlers on unmount to prevent stale listeners.
  useEffect(() => () => {
    for (const key of [...scrollHandlersRef.current.keys()]) {
      detachScrollHandler(scrollHandlersRef.current, key)
    }
  }, [])

  useLayoutEffect(() => {
    if (!aliveRef) return
    aliveRef.current = {
      remove(pathname) {
        if (pathname === pageKeyRef.current) return
        detachScrollHandler(scrollHandlersRef.current, pathname)
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
            detachScrollHandler(scrollHandlersRef.current, k)
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
                  // Guard: if key was already removed (e.g. by aliveRef.remove() called while
                  // the exit animation was still running), skip entirely. Without this check,
                  // activityModesRef would gain an orphaned entry for a key that is no longer
                  // in keysRef, causing a minor memory leak.
                  if (!keysRef.current.includes(key)) return
                  if (!shouldCache(
                    key,
                    include,
                    exclude,
                    snapshotsRef.current.get(key)?.cacheName,
                  )) {
                    // Non-cacheable: remove entirely so next visit re-mounts fresh.
                    detachScrollHandler(scrollHandlersRef.current, key)
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
                  <LocationContextProvider value={pageSnap.locCtx}>
                    {pageSnap.outlet}
                  </LocationContextProvider>
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
    const cancel = () => { cancelled = true }
    cancelRef.current = cancel
    Promise.resolve().then(() => { if (!cancelled) cbRef.current() })
    return () => {
      cancel()
      if (cancelRef.current === cancel) cancelRef.current = null
    }
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
    // Cancel any pending microtask from a previous run (StrictMode double-invoke
    // or rapid navigation). This prevents stale callbacks from firing.
    cancelRef.current?.()
    cancelRef.current = null

    // Branch 1 - Outside keepAlive: behave like a normal useEffect cleanup.
    // The callback fires on unmount.
    if (!isInKeepAlive) return () => { cbRef.current() }

    // Branch 2 - Inside keepAlive, page just became inactive (isActive false->true
    // transition re-ran this effect). The previous effect's cleanup (branch 3)
    // scheduled a microtask, but we just cancelled it above. Fire synchronously
    // so the callback is not lost.
    if (!isActive) {
      cbRef.current()
      return
    }

    // Branch 3 - Inside keepAlive, page is active. Register a cleanup that
    // fires when isActive changes true->false. Microtask deferral keeps it
    // consistent with useActivated and StrictMode-safe.
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
    return () => unregisterLayoutScope(scopeId, transition)
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
      } as Partial<typeof child.props>),
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
  mode,
  className,
  children,
}: AnimatedOutletProps) {
  const depth = useContext(DepthContext)
  const matches = useMatches()
  const location = useLocation()
  const keepAliveCtx = useContext(KeepAliveContext)

  // <KeepAlive> enables caching for this subtree; an explicit outlet mode may
  // specialize a nested outlet without creating another cache policy provider.
  const keepAlive = keepAliveCtx !== null || matches.some((m) => {
    const h = m.handle as Record<string, unknown> | null | undefined
    return h?.keepAlive === true || h?.keepBackground === true
  })

  if (children !== undefined && transition !== undefined) {
    return <PageScope transition={transition}>{children}</PageScope>
  }

  if (keepAlive) {
    // When wrapped in <KeepAlive>, inherit its mode unless this outlet overrides it.
    // When triggered by route handle, fall back to resolveOutletMode.
    const effectiveMode = keepAliveCtx !== null
      ? mode ?? keepAliveCtx.mode
      : resolveOutletMode(mode, matches, location.state)

    if (effectiveMode === 'switch') {
      // Switch mode: all pages cached by pathname, instant Activity show/hide.
      return (
        <DepthContext.Provider value={depth + 1}>
          {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
          <KeepAliveRoot
            max={keepAliveCtx?.maxRef.current}
            include={keepAliveCtx?.includeRef.current}
            exclude={keepAliveCtx?.excludeRef.current}
            aliveRef={keepAliveCtx?.aliveRef}
            layoutTransition={transition}
            className={className}
          />
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

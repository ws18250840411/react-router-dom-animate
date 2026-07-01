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
   * Ref for imperative cache control.  Only applies when `keepAlive={true}`.
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
   * component remount. Useful for root-level outlets where you want tab/stack
   * backgrounds to survive navigation to detail pages and back.
   */
  keepBackground?: boolean
  className?: string
  children?: ReactNode
}

const DepthContext = createContext(0)

function pageTransitionKey(
  mode: OutletMode,
  _depth: number,
  matches: UIMatch[],
  pathname: string,
  locationKey: string,
): string {
  if (mode === 'switch') return pathname
  // Use the layout-route ID at all depths so intermediate layouts (e.g. a tabs
  // layout wrapping a KeepAliveRoot) are not remounted on every same-layout
  // navigation. Using locationKey at depth>0 caused KeepAliveRoot to be
  // destroyed on every tab switch, losing cached scroll positions and state.
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
  const ctx = useRef(locCtx)
  return (
    <UNSAFE_LocationContext.Provider value={ctx.current as never}>{frozen}</UNSAFE_LocationContext.Provider>
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
 * Replaces `AnimatedRoot` when `keepBackground={true}` is set.
 *
 * PUSH navigation keeps the exiting page alive via `<Activity mode="hidden">` after
 * its exit animation completes.  The `<Activity>` boundary preserves component state,
 * DOM, and scroll positions (Activity keeps DOM nodes mounted, so `scrollTop` values
 * survive `display: none` without any manual save/restore logic).  Effects are cleaned
 * up while hidden, preventing background resource leaks.
 *
 * POP navigation switches the background page back to `<Activity mode="visible">` and
 * plays the enter animation.  Scroll positions are automatically restored by the browser
 * when `display: none` is removed and the element re-enters the layout flow.
 *
 * Each history entry is tracked by `location.key`, which is stable across React
 * re-renders and uniquely identifies a slot in the browser's history stack.
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

  const tabs = resolveTabs(tabsProp, location.state, depth)
  const mode = resolveOutletMode(modeProp, matches, location.state, tabs)
  const fallback = layoutTransition ?? (tabs ? 'none' : 'cover')
  const pageKey = pageTransitionKey(mode, depth, matches, location.pathname, location.key)

  // ---- Snapshot tracking (mirrors AnimatedRoot) ----
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

  // ---- Back-stack management ----
  type StackEntry = {
    locKey: string
    pageKey: string
    outlet: ReactNode
    locCtx: unknown
    nodeRef: RefObject<HTMLDivElement | null>
    /** Keep in DOM after exiting (background). False means unmount after exit. */
    alive: boolean
    /**
     * Activity mode for this entry.
     * - 'visible': during animation and when on top.
     * - 'hidden': after the exit animation completes (background entries only).
     *   React cleans up Effects in hidden subtrees, preventing background leaks.
     *   Scroll positions are saved in onExited (while still visible) and restored
     *   via useLayoutEffect when the entry returns to the top.
     */
    activityMode: 'visible' | 'hidden'
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
  // Entries freshly added via PUSH that need a second render to trigger enter animation.
  const pendingEnterRef = useRef(new Set<string>())

  // Synchronously update stack in render (same pattern as ref mutations in AnimatedRoot).
  const locKey = location.key
  const topEntry = stackRef.current[stackRef.current.length - 1] as StackEntry | undefined

  if (!topEntry) {
    // Initial mount — no animation
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
        // Restore background entry to top; entries above it are popped off.
        const below = stackRef.current.slice(0, bgIdx)
        const poppedOff = stackRef.current.slice(bgIdx + 1).map(e => ({ ...e, alive: false }))
        // Switch the restored entry back to visible so its enter animation plays.
        const restored: StackEntry = { ...stackRef.current[bgIdx], outlet, locCtx, activityMode: 'visible' }
        stackRef.current = [...below, ...poppedOff, restored]
      } else {
        // Target not found in back-stack (jumped back multiple levels). Start fresh.
        stackRef.current = [
          { locKey, pageKey, outlet, locCtx, nodeRef: getNodeRef(locKey), alive: true, activityMode: 'visible' },
        ]
      }
    } else if (navType === 'PUSH') {
      stackRef.current = [
        ...stackRef.current,
        { locKey, pageKey, outlet, locCtx, nodeRef: getNodeRef(locKey), alive: true, activityMode: 'visible' },
      ]
      // New PUSH entry: render first with in={false} so CSSTransition starts in "exited"
      // state; then useLayoutEffect triggers a second render with in={true} to play the
      // enter animation. Without this two-render trick CSSTransition would skip the
      // animation because it started life with in={true} (appear=false default).
      pendingEnterRef.current.add(locKey)
    } else {
      // REPLACE: swap top entry (no enter animation)
      stackRef.current = [
        ...stackRef.current.slice(0, -1),
        { locKey, pageKey, outlet, locCtx, nodeRef: getNodeRef(locKey), alive: true, activityMode: 'visible' },
      ]
    }
  } else {
    // Same location key: keep outlet current (location hasn't changed, just re-render).
    stackRef.current = stackRef.current.map((e, i, arr) =>
      i === arr.length - 1 ? { ...e, outlet, locCtx } : e,
    )
  }

  // Flush pendingEnter: change in={false} → in={true} for freshly pushed entries.
  useLayoutEffect(() => {
    if (pendingEnterRef.current.size > 0) {
      pendingEnterRef.current.clear()
      forceRender()
    }
  })

  return (
    <div className={className ? `animated-outlet-group ${className}` : 'animated-outlet-group'}>
      {stackRef.current.map((entry, i, arr) => {
        const isTop = i === arr.length - 1
        const isSecond = i === arr.length - 2
        // Only the top two entries play animations; deeper background entries are
        // hidden by Activity (mode='hidden') so they need no animation.
        const entryTimeout = isTop || isSecond ? timeout : 0
        const entryClassNames = isTop || isSecond ? activePlan.classNames : {}
        // pendingEnter entries render with in={false} on first paint so that
        // CSSTransition starts in "exited" state; the useLayoutEffect flush then
        // triggers in={true} to start the enter animation.
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
                  // Popped pages: remove entirely from stack and DOM.
                  stackRef.current = stackRef.current.filter(e => e.locKey !== entry.locKey)
                  nodeRefsCache.current.delete(entry.locKey)
                  forceRender()
                } else {
                  // Background pages: switch to Activity hidden after exit animation.
                  // Activity keeps DOM nodes mounted, so scroll positions are preserved
                  // by the browser across display:none hide/show cycles automatically.
                  stackRef.current = stackRef.current.map(e =>
                    e.locKey === entry.locKey ? { ...e, activityMode: 'hidden' as const } : e,
                  )
                  forceRender()
                }
              }}
            >
              <div ref={entry.nodeRef} className="animated-outlet-page">
                <UNSAFE_LocationContext.Provider value={entry.locCtx as never}>
                  {entry.outlet}
                </UNSAFE_LocationContext.Provider>
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
 * Each unique pathname is cached in the DOM after the first visit.  Switching
 * tabs shows the cached page via `<Activity mode="visible">` and hides others
 * with `<Activity mode="hidden">`.  The `<Activity>` boundary:
 *   - Visually hides content via `display: none`
 *   - Cleans up all Effects in the hidden subtree (prevents background leaks)
 *   - Preserves React component state (useState, useReducer, …)
 *   - Note: `display: none` resets `scrollTop` for nested overflow containers
 *     in the browser, so we save/restore scroll positions manually (see the
 *     "Scroll preservation" block below).
 *
 * When `max` is set, the least-recently-visited page beyond the limit is
 * evicted (unmounted entirely) using an LRU strategy.
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
  // Ordered list of cached pathnames — tail is most-recently-used (LRU).
  const keysRef = useRef<string[]>([])
  // Stable ref to current pageKey for imperative callbacks.
  const pageKeyRef = useRef(pageKey)
  pageKeyRef.current = pageKey
  // Triggered by imperative remove/removeAll to sync the render.
  const [, forceRender] = useReducer((n: number) => n + 1, 0)

  // Always update the snapshot so the active page gets fresh outlet/locCtx.
  snapshotsRef.current.set(pageKey, { outlet, locCtx })

  // Update LRU ordering: move current key to tail (most-recently-used).
  if (keysRef.current.includes(pageKey)) {
    keysRef.current = keysRef.current.filter((k) => k !== pageKey)
  }
  keysRef.current = [...keysRef.current, pageKey]

  // Evict least-recently-used entries when over the max limit.
  if (max !== undefined && keysRef.current.length > max) {
    const evicted = keysRef.current.slice(0, keysRef.current.length - max)
    keysRef.current = keysRef.current.slice(keysRef.current.length - max)
    for (const k of evicted) snapshotsRef.current.delete(k)
  }

  // ── Scroll preservation ────────────────────────────────────────────────────
  // <Activity mode="hidden"> applies display:none, which resets scrollTop for
  // nested overflow containers. We save scroll positions during the render
  // phase (before React commits the DOM mutation, so the old DOM is still
  // readable via containerRefsRef) and restore them in useLayoutEffect after
  // the new active page is shown.
  //
  // Reading DOM in render is safe here: it is a side-effect-free read of the
  // already-committed DOM, and concurrent double-renders are idempotent.
  const containerRefsRef = useRef(new Map<string, HTMLDivElement>())
  const savedScrollsRef = useRef(new Map<string, Array<[HTMLElement, number, number]>>())
  const prevPageKeyRef = useRef(pageKey)

  if (prevPageKeyRef.current !== pageKey) {
    const leavingKey = prevPageKeyRef.current
    const container = containerRefsRef.current.get(leavingKey)
    if (container) {
      const scrollables: Array<[HTMLElement, number, number]> = []
      container.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
          scrollables.push([el, el.scrollTop, el.scrollLeft])
        }
      })
      savedScrollsRef.current.set(leavingKey, scrollables)
    }
    prevPageKeyRef.current = pageKey
  }

  // Restore scroll positions after the newly-active page becomes visible.
  useLayoutEffect(() => {
    const saved = savedScrollsRef.current.get(pageKey)
    if (saved?.length) {
      for (const [el, top, left] of saved) {
        el.scrollTop = top
        el.scrollLeft = left
      }
    }
  }, [pageKey])
  // ── End scroll preservation ────────────────────────────────────────────────

  // Expose imperative cache-control API via aliveRef.
  useLayoutEffect(() => {
    if (!aliveRef) return
    aliveRef.current = {
      remove(pathname) {
        if (pathname === pageKeyRef.current) return
        snapshotsRef.current.delete(pathname)
        keysRef.current = keysRef.current.filter((k) => k !== pathname)
        savedScrollsRef.current.delete(pathname)
        forceRender()
      },
      removeAll() {
        const active = pageKeyRef.current
        for (const k of [...keysRef.current]) {
          if (k !== active) {
            snapshotsRef.current.delete(k)
            savedScrollsRef.current.delete(k)
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
 *
 * Firing is deferred to a microtask so the callback always executes
 * asynchronously, consistent with `useDeactivated`.
 *
 * Note on ordering: React 18 concurrent mode processes effects for newly
 * activating pages before deactivating pages within the same render batch,
 * so `useActivated` may fire before the sibling `useDeactivated`. This is
 * a React runtime difference from Vue KeepAlive but does not affect
 * practical use cases (data loading, cleanup are page-local).
 *
 * React StrictMode safety: StrictMode runs mount → cleanup → re-mount. The
 * re-mount calls `cancelRef.current?.()` which cancels the pending microtask
 * before it fires; only the microtask from the re-mount executes, so the
 * callback fires exactly once per activation cycle.
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
 * Fires every time the page is deactivated:
 * - Inside keepAlive: fires immediately on tab switch (isActive → false), or
 *   asynchronously (next microtask) when the keepAlive group unmounts while
 *   this page is still active (e.g. navigating to a non-tab route).
 * - Outside keepAlive: equivalent to a `useEffect` cleanup (fires on unmount).
 *
 * React StrictMode safety: StrictMode simulates unmount+remount on the same
 * component instance to surface cleanup bugs. The remount causes the next
 * effect to run synchronously and cancel the pending microtask before it
 * executes, so the callback is never fired spuriously on initial mount.
 */
export function useDeactivated(callback: () => void): void {
  const isInKeepAlive = useContext(PageActiveContext) !== null
  const isActive = usePageActive()
  const cbRef = useRef(callback)
  cbRef.current = callback
  // Holds a cancel function for any pending microtask-based deactivation.
  // Calling it before the microtask fires prevents a spurious invocation.
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Cancel any pending deactivation from the previous cleanup — this runs
    // on both StrictMode re-mounts (same instance) and normal deps changes,
    // preventing the microtask from firing when the component stays alive.
    cancelRef.current?.()
    cancelRef.current = null

    if (!isInKeepAlive) return () => { cbRef.current() }

    if (!isActive) {
      // Tab switch: page became inactive — fire immediately.
      cbRef.current()
      return
    }

    // Active page in keepAlive: schedule deactivation via a microtask so it
    // fires when the keepAlive group unmounts (no re-mount, microtask runs).
    // If the component re-mounts first (StrictMode or deps change), the cancel
    // at the top of the next effect invocation voids the microtask.
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

  // Lock pageKey to the value computed when location.key last changed.
  // useMatches() reads the global router state (not frozen by UNSAFE_LocationContext),
  // so inside a keepBackground background entry it can drift from the frozen
  // location and produce a different pageKey — causing TransitionGroup to re-key
  // its child and destroy the kept-alive DOM. By snapshotting on location.key
  // changes only, we ensure the key stays stable while the location is frozen.
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

  // Allow declaring keepAlive / keepBackground via route handle in addition to props.
  // Prop takes precedence; handle is used when prop is not provided.
  // Usage: export const meta = { keepAlive: true } in a _layout.tsx file.
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

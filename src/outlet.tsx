import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
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
import type { ClassNames, OutletMode, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

export interface AnimatedOutletProps {
  transition?: RouteAnimType
  tabs?: boolean
  mode?: OutletMode
  keepAlive?: boolean
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

function KeepAliveRoot({
  layoutTransition: _layoutTransition,
  className,
}: {
  layoutTransition?: RouteAnimType
  className?: string
}) {
  const location = useLocation()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const pageKey = location.pathname

  type PageSnap = { outlet: ReactNode; locCtx: unknown }
  const snapshotsRef = useRef(new Map<string, PageSnap>())
  snapshotsRef.current.set(pageKey, { outlet, locCtx })

  const keysRef = useRef<string[]>([])
  if (!keysRef.current.includes(pageKey)) {
    keysRef.current = [...keysRef.current, pageKey]
  }

  return (
    <div className={className ? `animated-outlet-group ${className}` : 'animated-outlet-group'}>
      {keysRef.current.map((key) => {
        const snap = snapshotsRef.current.get(key)!
        const isActive = key === pageKey
        return (
          <div
            key={key}
            className={isActive ? 'animated-outlet-page fr-tab-active' : 'animated-outlet-page fr-tab-inactive'}
          >
            <PageActiveContext.Provider value={pageKey}>
              <UNSAFE_LocationContext.Provider value={snap.locCtx as never}>
                {snap.outlet}
              </UNSAFE_LocationContext.Provider>
            </PageActiveContext.Provider>
          </div>
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
        key={pageKey}
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
  keepAlive,
  mode,
  className,
  children,
}: AnimatedOutletProps) {
  const depth = useContext(DepthContext)

  if (children !== undefined && transition !== undefined) {
    return <PageScope transition={transition}>{children}</PageScope>
  }

  if (keepAlive) {
    return (
      <DepthContext.Provider value={depth + 1}>
        {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
        <KeepAliveRoot layoutTransition={transition} className={className} />
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

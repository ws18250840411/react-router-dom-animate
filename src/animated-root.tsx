import {
  cloneElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import {
  UNSAFE_LocationContext,
  useLocation,
  useMatches,
  useNavigationType,
  useNavigation,
  useOutlet,
} from 'react-router-dom'
import { TransitionGroup } from 'react-transition-group'

import { groupClassName, PageTransition } from './common'
import { DepthContext, type LocCtxValue } from './context'
import {
  layoutRouteId,
  planTransition,
  registerLayoutScope,
  resolveOutletMode,
  sameLayoutPage,
  unregisterLayoutScope,
  IDLE,
} from './transition'
import type { OutletMode, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

// ===========================================================================
// LayoutScopeRegistrar
// ===========================================================================

export function LayoutScopeRegistrar({ transition }: { transition: RouteAnimType }) {
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

// ===========================================================================
// AnimatedRoot - no-cache mode (TransitionGroup + CSSTransition)
// ===========================================================================

function snapLocation(
  location: ReturnType<typeof useLocation>,
  matches: ReturnType<typeof useMatches>,
): RouteSnapshot {
  return {
    path: location.pathname,
    key: location.key,
    state: location.state,
    matches,
  }
}

export function AnimatedRoot({
  depth,
  mode: modeProp,
  layoutTransition,
  onTransitionStart,
  onTransitionEnd,
  className,
}: {
  depth: number
  mode?: OutletMode
  layoutTransition?: RouteAnimType
  onTransitionStart?: () => void
  onTransitionEnd?: () => void
  className?: string
}) {
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext) as LocCtxValue
  const isPending = useNavigation().state !== 'idle'
  const mode = resolveOutletMode(modeProp, matches, location.state)
  const tabs = mode === 'switch'
  const fallback = layoutTransition ?? (tabs ? 'none' : 'cover')
  const pageKey =
    mode === 'switch'
      ? location.pathname
      : layoutRouteId(matches, location.pathname) ?? location.key

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

  const fromSnapRef = useRef<RouteSnapshot>(snapLocation(location, matches))
  const toSnapRef = useRef<RouteSnapshot>(snapLocation(location, matches))
  const lastToKeyRef = useRef(location.key)

  if (lastToKeyRef.current !== location.key) {
    fromSnapRef.current = toSnapRef.current
    lastToKeyRef.current = location.key
    toSnapRef.current = snapLocation(location, matches)
  }

  const activePlan: TransitionPlan = useMemo(() => {
    const fromSnap = fromSnapRef.current
    const toSnap = toSnapRef.current
    if (!tabs && sameLayoutPage(fromSnap, toSnap)) return IDLE
    const effectiveNav =
      mode === 'switch' && navType === 'PUSH' && fromSnap.path !== toSnap.path ? 'REPLACE' : navType
    return planTransition(effectiveNav, fromSnap, toSnap, fallback, { tabs })
  }, [tabs, mode, navType, location.key, settledLocation.key, fallback])

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

  const onTransitionStartRef = useRef(onTransitionStart)
  onTransitionStartRef.current = onTransitionStart
  const onTransitionEndRef = useRef(onTransitionEnd)
  onTransitionEndRef.current = onTransitionEnd
  const commitSettled = useCallback(() => {
    if (settledKeyRef.current !== locationRef.current.key) {
      setSettledLocation(locationRef.current)
      onTransitionEndRef.current?.()
    }
  }, [])

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    onTransitionStartRef.current?.()
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
      className={groupClassName(className)}
      childFactory={childFactory}
      data-pending={isPending || undefined}
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


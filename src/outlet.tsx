import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
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
} from './transition'
import type { ClassNames, OutletMode, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

export interface AnimatedOutletProps {
  transition?: RouteAnimType
  /** Tab 菜单：平级切换 + 同 Tab 静默；slide 时按 tabIndex 双向滑动 */
  tabs?: boolean
  /** stack（默认）栈式 push/pop；switch 非 Tab 的平级切换 */
  mode?: OutletMode
  className?: string
  children?: ReactNode
}

const DepthContext = createContext(0)

function pageTransitionKey(
  mode: OutletMode,
  depth: number,
  matches: UIMatch[],
  pathname: string,
  locationKey: string,
): string {
  if (mode === 'switch') return pathname
  if (depth > 0) return locationKey
  return layoutRouteId(matches, pathname) ?? locationKey
}

function snap(location: Location, matches: UIMatch[]): RouteSnapshot {
  return {
    path: location.pathname,
    key: location.key,
    state: location.state,
    matches: matches.map((m) => ({ ...m, handle: m.handle })),
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

function LayoutScopeRegistrar({ transition }: { transition: RouteAnimType }) {
  const depth = useContext(DepthContext)
  const matches = useMatches()
  const { pathname } = useLocation()
  const scopeId = layoutRouteId(matches, pathname)

  useLayoutEffect(() => {
    if (depth === 0 || !scopeId) return
    registerLayoutScope(scopeId, transition)
    return () => unregisterLayoutScope(scopeId)
  }, [depth, transition, scopeId])

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
  const fallback = layoutTransition ?? 'cover'
  const tabs = resolveTabs(tabsProp, location.state, depth)
  const mode = resolveOutletMode(modeProp, matches, location.state, tabs)
  const pageKey = pageTransitionKey(mode, depth, matches, location.pathname, location.key)
  const locationRef = useRef(location)
  locationRef.current = location
  const [settledLocation, setSettledLocation] = useState(location)
  const committedMatchesRef = useRef(matches)

  if (settledLocation.key === location.key) {
    committedMatchesRef.current = matches.map((m) => ({ ...m, handle: m.handle }))
  }

  const toSnap = snap(location, matches)
  const fromSnap: RouteSnapshot =
    settledLocation.key !== location.key
      ? {
          path: settledLocation.pathname,
          key: settledLocation.key,
          state: settledLocation.state,
          matches: committedMatchesRef.current.map((m) => ({ ...m, handle: m.handle })),
        }
      : snap(settledLocation, matches)

  const activePlan: TransitionPlan = useMemo(() => {
    if (depth === 0 && sameLayoutPage(fromSnap, toSnap)) {
      return { classNames: { enter: '', enterActive: '', exit: '', exitActive: '' }, duration: 0 }
    }
    const effectiveNav =
      mode === 'switch' && navType === 'PUSH' && fromSnap.path !== toSnap.path ? 'REPLACE' : navType
    return planTransition(effectiveNav, fromSnap, toSnap, fallback, { tabs })
  }, [
      tabs,
      mode,
      navType,
      depth,
      location.key,
      settledLocation.key,
      fromSnap.key,
      fromSnap.path,
      fromSnap.state,
      fromSnap.matches,
      toSnap.key,
      toSnap.path,
      toSnap.state,
      fallback,
    ],
  )

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
        onExited: () => {
          ;(child.props as { onExited?: () => void }).onExited?.()
          commitSettled()
        },
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
  mode,
  className,
  children,
}: AnimatedOutletProps) {
  const depth = useContext(DepthContext)

  if (children !== undefined && transition !== undefined) {
    return <PageScope transition={transition}>{children}</PageScope>
  }

  if (depth > 0) {
    return (
      <DepthContext.Provider value={depth + 1}>
        {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
        <AnimatedRoot depth={depth} tabs={tabs} mode={mode} layoutTransition={transition} className={className} />
      </DepthContext.Provider>
    )
  }

  return (
    <DepthContext.Provider value={1}>
      {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
      <AnimatedRoot depth={0} tabs={tabs} mode={mode} layoutTransition={transition} className={className} />
    </DepthContext.Provider>
  )
}

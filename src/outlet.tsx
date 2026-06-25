/**
 * AnimatedOutlet — 渲染层对齐 unplugin-react-router-dom/outlet-component.ts + RTG 官方模式。
 * @see docs/DESIGN.md
 */
import './anim.css'
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
  Outlet,
  UNSAFE_LocationContext,
  useLocation,
  useMatches,
  useNavigationType,
  useNavigate,
  useOutlet,
  type Location,
  type UIMatch,
} from 'react-router-dom'
import { CSSTransition, TransitionGroup } from 'react-transition-group'

import {
  DEFAULT_ANIM,
  layoutRouteId,
  planTransition,
  readDurationMs,
  registerLayoutScope,
  registerPageAnim,
  unregisterLayoutScope,
  unregisterPageAnim,
} from './transition'
import { executePendingNav } from './navigate'
import { NavigateQueueContext, type PendingNav } from './navigate-queue'
import type { ClassNames, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

export interface AnimatedOutletProps {
  transition?: RouteAnimType
  className?: string
  children?: ReactNode
}

const DepthContext = createContext(0)

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

/** unplugin FrozenPage：冻结 outlet 与 LocationContext，防止离场页内容被替换 */
function FrozenOutlet({ outlet, locCtx }: { outlet: ReactNode; locCtx: unknown }) {
  const [frozen] = useState(outlet)
  const ctx = useRef(locCtx)
  return (
    <UNSAFE_LocationContext.Provider value={ctx.current as never}>{frozen}</UNSAFE_LocationContext.Provider>
  )
}

/** 每页独立 nodeRef；须把 TransitionGroup 注入的 in/onExited 等转发给 CSSTransition */
function PageTransition({
  outlet,
  locCtx,
  classNames,
  timeout,
  onExited,
  ...transitionProps
}: {
  outlet: ReactNode
  locCtx: unknown
  classNames: ClassNames
  timeout: number | { enter: number; exit: number }
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
        <FrozenOutlet outlet={outlet} locCtx={locCtx} />
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

function AnimatedRoot({ layoutTransition, className }: { layoutTransition?: RouteAnimType; className?: string }) {
  const navigate = useNavigate()
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const fallback = layoutTransition ?? DEFAULT_ANIM
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

  const activePlan: TransitionPlan = useMemo(
    () => planTransition(navType, fromSnap, toSnap, fallback),
    [
      navType,
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

  const animBusyRef = useRef(false)
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingNavRef = useRef<PendingNav | null>(null)
  const settledKeyRef = useRef(settledLocation.key)
  settledKeyRef.current = settledLocation.key

  const clearAnimBusy = useCallback(() => {
    if (animTimerRef.current !== undefined) {
      clearTimeout(animTimerRef.current)
      animTimerRef.current = undefined
    }
    animBusyRef.current = false
  }, [])

  const flushPendingNav = useCallback(() => {
    const item = pendingNavRef.current
    pendingNavRef.current = null
    if (!item) return
    executePendingNav(navigate, item)
  }, [navigate])

  const flushPendingNavRef = useRef(flushPendingNav)
  flushPendingNavRef.current = flushPendingNav

  /** RTG onExited：离场结束后提交 settled（官方推荐清理/提交时机） */
  const commitSettled = useCallback(() => {
    clearAnimBusy()
    if (settledKeyRef.current !== locationRef.current.key) {
      setSettledLocation(locationRef.current)
    }
    flushPendingNavRef.current()
  }, [clearAnimBusy])

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    if (activePlan.duration <= 0) {
      commitSettled()
      return
    }
    const timer = window.setTimeout(commitSettled, activePlan.duration + 50)
    return () => window.clearTimeout(timer)
  }, [location.key, activePlan.duration, settledLocation.key, commitSettled])

  const markAnimBusy = useCallback((durationMs: number) => {
    animBusyRef.current = true
    if (animTimerRef.current !== undefined) clearTimeout(animTimerRef.current)
    if (durationMs <= 0) {
      animBusyRef.current = false
      return
    }
    animTimerRef.current = setTimeout(() => {
      animBusyRef.current = false
      animTimerRef.current = undefined
      flushPendingNavRef.current()
    }, durationMs + 50)
  }, [])

  const queueApi = useMemo(
    () => ({
      runOrEnqueue(item: PendingNav) {
        if (!animBusyRef.current) {
          const duration = readDurationMs()
          markAnimBusy(duration)
          executePendingNav(navigate, item)
          return
        }
        pendingNavRef.current = item
      },
    }),
    [navigate, markAnimBusy],
  )

  /** RTG childFactory：离场子节点也注入当前 classNames / timeout（不覆盖 nodeRef） */
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
    <NavigateQueueContext.Provider value={queueApi}>
      <TransitionGroup
        className={className ? `animated-outlet-group ${className}` : 'animated-outlet-group'}
        childFactory={childFactory}
      >
        <PageTransition
          key={location.key}
          outlet={outlet}
          locCtx={locCtx}
          classNames={activePlan.classNames}
          timeout={timeout}
          onExited={commitSettled}
        />
      </TransitionGroup>
    </NavigateQueueContext.Provider>
  )
}

export default function AnimatedOutlet({ transition, className, children }: AnimatedOutletProps) {
  const depth = useContext(DepthContext)

  if (children !== undefined && transition !== undefined) {
    return <PageScope transition={transition}>{children}</PageScope>
  }

  if (depth > 0) {
    return (
      <DepthContext.Provider value={depth + 1}>
        {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
        <Outlet />
      </DepthContext.Provider>
    )
  }

  return (
    <DepthContext.Provider value={1}>
      {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
      <AnimatedRoot layoutTransition={transition} className={className} />
    </DepthContext.Provider>
  )
}

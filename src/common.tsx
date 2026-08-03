import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, type Location, type UIMatch } from 'react-router-dom'
import { CSSTransition } from 'react-transition-group'

import { LocationContextProvider, type LocCtxValue } from './context'
import { layoutRouteId, registerPageAnim, unregisterPageAnim } from './transition'
import type { ClassNames, OutletMode, RouteAnimType, RouteSnapshot } from './types'

// ===========================================================================
// Class Name Utilities
// ===========================================================================

/** Build the outer group className, optionally appending a user-supplied class. */
export function groupClassName(extra?: string): string {
  return extra ? `animated-outlet-group ${extra}` : 'animated-outlet-group'
}

/** Extract the initial-position class (fr-tab-pre-enter-*) from a CSSTransition enter className. */
export function extractPreEnterClass(enterClass: string | undefined): string {
  if (!enterClass) return ''
  const match = /\bfr-tab-pre-enter-\S+/.exec(enterClass)
  return match ? match[0] : ''
}

// ===========================================================================
// Route Snapshot & Page Key
// ===========================================================================

export function snap(location: Location, matches: UIMatch[]): RouteSnapshot {
  return {
    path: location.pathname,
    key: location.key,
    state: location.state,
    // Store reference directly - React Router creates a new matches array
    // per location change, so from/to never alias. Avoids O(n) copy per nav.
    matches,
  }
}

export function pageTransitionKey(
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

// ===========================================================================
// PageScope (page-level animation override registration)
// ===========================================================================

/** Registers a per-page animation override for the active pathname. */
export function PageScope({
  transition,
  children,
}: {
  transition: RouteAnimType
  children: ReactNode
}) {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    registerPageAnim(pathname, transition)
    return () => unregisterPageAnim(pathname, transition)
  }, [pathname, transition])
  return children
}

// ===========================================================================
// FrozenOutlet / PageTransition (exit animation helpers)
// ===========================================================================

/**
 * Freezes the exiting page's outlet at the moment of navigation so it doesn't
 * re-render with the new route while its exit animation plays.
 *
 * Uses `UNSAFE_LocationContext` — an internal RRD API. If removed in a future
 * RRD version the exiting page will show the new route's content during exit
 * (visual glitch only, not a hard error). Pin RRD and verify after upgrading.
 */
export function FrozenOutlet({
  outlet,
  locCtx,
}: {
  outlet: ReactNode
  locCtx: LocCtxValue
}) {
  const [frozen] = useState(outlet)
  const [frozenCtx] = useState(locCtx)
  return <LocationContextProvider value={frozenCtx}>{frozen}</LocationContextProvider>
}

export function PageTransition({
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

import { createContext, type Context, type ReactNode, type RefObject } from 'react'
import { UNSAFE_LocationContext } from 'react-router-dom'

import type { KeepAliveFilter, KeepAliveRef, OutletMode } from './types'

// ===========================================================================
// Location Context
// ===========================================================================

/**
 * Infer the value type of UNSAFE_LocationContext (LocationContextObject is
 * not exported by react-router). Used to type locCtx without `as never`.
 */
export type LocCtxValue = (typeof UNSAFE_LocationContext) extends Context<infer V> ? V : never

/**
 * Wraps `UNSAFE_LocationContext.Provider` to freeze the exiting page's location
 * context during exit animations. If `UNSAFE_LocationContext` is removed in a
 * future React Router version, replace this component with a passthrough:
 *
 *   function LocationContextProvider({ children }) { return <>{children}</> }
 *
 * The only impact of a passthrough is that exit animations may briefly show the
 * new route's content (visual glitch), not a hard error.
 * Pin RRD and verify after upgrading.
 */
export function LocationContextProvider({
  value,
  children,
}: {
  value: LocCtxValue
  children: ReactNode
}) {
  return <UNSAFE_LocationContext.Provider value={value}>{children}</UNSAFE_LocationContext.Provider>
}

// ===========================================================================
// Depth / Frozen Contexts
// ===========================================================================

/** Tracks the nesting depth of AnimatedOutlet components. */
export const DepthContext = createContext(0)

/**
 * Signals that this subtree is inside an alive=false (exiting)
 * BackgroundPreserveRoot entry. Nested BackgroundPreserveRoots must not
 * update their outlet/locCtx while frozen.
 */
export const FrozenContext = createContext(false)

// ===========================================================================
// KeepAlive Context
// ===========================================================================

export interface KeepAliveContextValue {
  mode: OutletMode
  maxRef: RefObject<number | undefined>
  // include/exclude are stored as refs so the context value stays stable
  // even when the user passes inline functions that change on every render.
  includeRef: RefObject<KeepAliveFilter | undefined>
  excludeRef: RefObject<KeepAliveFilter | undefined>
  aliveRef?: RefObject<KeepAliveRef | null | undefined>
}

export const KeepAliveContext = createContext<KeepAliveContextValue | null>(null)

// ===========================================================================
// Page Active Context (for useActivated / useDeactivated)
// ===========================================================================

/** Holds the currently active page pathname; null outside KeepAlive switch-mode. */
export const PageActiveContext = createContext<string | null>(null)

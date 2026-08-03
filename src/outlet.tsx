import { useContext, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useLocation, useMatches } from 'react-router-dom'

import { PageScope } from './common'
import { DepthContext, KeepAliveContext, type KeepAliveContextValue } from './context'
import { AnimatedRoot, LayoutScopeRegistrar } from './animated-root'
import { BackgroundPreserveRoot } from './stack-root'
import { KeepAliveRoot } from './switch-root'
import { resolveOutletMode } from './transition'
import type { KeepAliveFilter, KeepAliveRef, OutletMode, RouteAnimType } from './types'

// Re-export hooks so index.ts can import them from here as before.
export { useActivated, useDeactivated } from './hooks'

// ===========================================================================
// AnimatedOutlet public props
// ===========================================================================

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
  /**
   * Fires when a route transition starts (before the animation plays).
   * Also fires for instant transitions (duration=0). Use this to show
   * loading indicators, lock interaction, or trigger analytics.
   */
  onTransitionStart?: () => void
  /**
   * Fires when a route transition completes (after the animation finishes
   * and the settled location is committed). Paired with `onTransitionStart`.
   */
  onTransitionEnd?: () => void
}

// ===========================================================================
// KeepAlive public props + component
// ===========================================================================

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

// ===========================================================================
// AnimatedOutlet - entry point (dispatches to AnimatedRoot / BPR / KeepAliveRoot)
// ===========================================================================

export default function AnimatedOutlet({
  transition,
  mode,
  className,
  children,
  onTransitionStart,
  onTransitionEnd,
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
      return (
        <DepthContext.Provider value={depth + 1}>
          {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
          <KeepAliveRoot
            max={keepAliveCtx?.maxRef.current}
            include={keepAliveCtx?.includeRef.current}
            exclude={keepAliveCtx?.excludeRef.current}
            aliveRef={keepAliveCtx?.aliveRef}
            layoutTransition={transition}
            onTransitionStart={onTransitionStart}
            onTransitionEnd={onTransitionEnd}
            className={className}
          />
        </DepthContext.Provider>
      )
    }
    return (
      <DepthContext.Provider value={depth + 1}>
        {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
        <BackgroundPreserveRoot
          depth={depth}
          layoutTransition={transition}
          max={keepAliveCtx?.maxRef.current}
          onTransitionStart={onTransitionStart}
          onTransitionEnd={onTransitionEnd}
          aliveRef={keepAliveCtx?.aliveRef}
          className={className}
        />
      </DepthContext.Provider>
    )
  }

  return (
    <DepthContext.Provider value={depth + 1}>
      {transition ? <LayoutScopeRegistrar transition={transition} /> : null}
      <AnimatedRoot
        depth={depth}
        mode={mode}
        layoutTransition={transition}
        onTransitionStart={onTransitionStart}
        onTransitionEnd={onTransitionEnd}
        className={className}
      />
    </DepthContext.Provider>
  )
}

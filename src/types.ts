import type { UIMatch } from 'react-router-dom'

export type RouteAnimType = string
export type NavType = 'PUSH' | 'POP' | 'REPLACE'
export type OutletMode = 'stack' | 'switch'

export interface ClassNames {
  appear?: string
  appearActive?: string
  appearDone?: string
  enter: string
  enterActive: string
  enterDone?: string
  exit: string
  exitActive: string
  exitDone?: string
}

export interface RouteSnapshot {
  path: string
  key: string
  state: unknown
  matches: UIMatch[]
}

export interface TransitionPlan {
  classNames: ClassNames
  duration: number
}

/**
 * Tab-specific animation variants for keepAlive switch mode.
 *
 * When a preset defines `tab`, `classNamesForTabs` uses it instead of the
 * generic `forward`/`back` fields — ensuring proper pre-enter positioning
 * (e.g. `fr-tab-pre-enter-*`) works for every animation type without
 * per-type hardcoded handling.
 */
export interface TabPreset {
  /** ClassNames for forward navigation (lower tabIndex → higher tabIndex, e.g. Tab A → Tab B). */
  forward: ClassNames
  /**
   * ClassNames for backward navigation (higher tabIndex → lower tabIndex, e.g. Tab B → Tab A).
   * If absent, falls back to `forward` (symmetric animation).
   */
  back?: ClassNames
  /**
   * ClassNames when direction cannot be determined (no `tabIndex` set on routes).
   * If absent, falls back to `forward`.
   */
  undirected?: ClassNames
  /**
   * When `true`, always uses `forward` regardless of tab direction.
   * Useful for symmetric animations like `modal` tabs that always push up.
   */
  bidirectional?: boolean
}

export interface AnimPreset {
  type: RouteAnimType
  forward: ClassNames
  back: ClassNames
  /** Override the default --fr-duration for this specific animation type. */
  durationMs?: number
  /**
   * Tab-specific animation variants for keepAlive switch mode.
   *
   * When provided, `classNamesForTabs` uses these instead of the generic
   * `forward`/`back` fields, enabling correct pre-enter positioning for
   * all animation types without per-type hardcoded branches.
   *
   * Custom presets registered via `registerAnimPreset` should define `tab`
   * if they need smooth keepAlive switch-mode animations.
   */
  tab?: TabPreset
}

export interface AnimPresetRegistry {
  register: (preset: AnimPreset) => void
  get: (type: RouteAnimType) => AnimPreset | undefined
  has: (type: RouteAnimType) => boolean
  types: () => RouteAnimType[]
}

/**
 * Filter for controlling which pages are cached in keepAlive switch mode.
 *
 * - `string[]`: array of exact pathnames to match (e.g. `['/home', '/profile']`)
 * - `RegExp`: regex tested against the pathname (e.g. `/^\/tabs\//`)
 * - `(pathname: string) => boolean`: custom predicate function
 *
 * Used by `include` (allow-list) and `exclude` (deny-list) props on
 * `<KeepAlive mode="switch">`.
 */
export type KeepAliveFilter = ReadonlyArray<string> | RegExp | ((pathname: string) => boolean)

/** Route handle fields recognized by AnimatedOutlet and KeepAlive. */
export interface AnimatedRouteHandle {
  transition?: RouteAnimType
  mode?: OutletMode
  tabIndex?: number
  keepAlive?: boolean
  keepBackground?: boolean
  keepAliveName?: string
}

/**
 * Imperative handle exposed via `aliveRef` on `<KeepAlive mode="switch">`.
 * Allows programmatic control over the keepAlive page cache.
 */
export interface KeepAliveRef {
  /**
   * Remove a specific pathname from the cache.
   * The next navigation to that pathname will remount it from scratch.
   * Has no effect if `pathname` is the currently-active page.
   */
  remove: (pathname: string) => void
  /**
   * Remove all inactive (hidden) pages from the cache.
   * The currently-active page is unaffected.
   */
  removeAll: () => void
  /**
   * Return the list of currently-cached pathnames in LRU order
   * (tail = most recently used).
   */
  getCached: () => string[]
}

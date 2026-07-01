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

export interface AnimPreset {
  type: RouteAnimType
  forward: ClassNames
  back: ClassNames
  /** Override the default --fr-duration for this specific animation type. */
  durationMs?: number
}

export interface AnimPresetRegistry {
  register: (preset: AnimPreset) => void
  get: (type: RouteAnimType) => AnimPreset | undefined
  has: (type: RouteAnimType) => boolean
  types: () => RouteAnimType[]
}

/**
 * Imperative handle returned by `aliveRef` on `<AnimatedOutlet keepAlive>`.
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

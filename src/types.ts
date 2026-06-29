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
}

export interface AnimPresetRegistry {
  register: (preset: AnimPreset) => void
  get: (type: RouteAnimType) => AnimPreset | undefined
  has: (type: RouteAnimType) => boolean
  types: () => RouteAnimType[]
}

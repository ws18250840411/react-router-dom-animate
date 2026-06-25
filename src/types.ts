import type { UIMatch } from 'react-router-dom'

export type RouteAnimType = string
export type NavType = 'PUSH' | 'POP' | 'REPLACE'

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

/** 某一时刻路由的完整快照（含 state，POP 时从离场页 state 读动画类型） */
export interface RouteSnapshot {
  path: string
  key: string
  state: unknown
  matches: UIMatch[]
}

/** 一次导航的动画计划：Outlet 只负责把 classNames 交给 CSSTransition */
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

import type { UIMatch } from 'react-router-dom'

import type {
  AnimPreset,
  AnimPresetRegistry,
  ClassNames,
  NavType,
  RouteAnimType,
  RouteSnapshot,
  TransitionPlan,
} from './types'

// ─── 动画时长（读 CSS 变量 --fr-duration，与 unplugin readDuration 一致）────────

let durationMs = 300

export function readDurationMs(): number {
  if (typeof document === 'undefined') return durationMs
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--fr-duration').trim()
  if (!raw) return durationMs
  if (raw.endsWith('ms')) durationMs = Number.parseInt(raw, 10) || 300
  else if (raw.endsWith('s')) durationMs = Math.round(Number.parseFloat(raw) * 1000) || 300
  return durationMs
}

// ─── 预设注册表 ───────────────────────────────────────────────────────────────

const BASE = 'fr-animating fr-anim'
const presets = new Map<RouteAnimType, AnimPreset>()

export const animPresetRegistry: AnimPresetRegistry = {
  register(preset) {
    presets.set(preset.type, preset)
  },
  get(type) {
    return presets.get(type)
  },
  has(type) {
    return presets.has(type)
  },
  types() {
    return [...presets.keys()]
  },
}

export function registerAnimPreset(preset: AnimPreset): void {
  animPresetRegistry.register(preset)
}

export function parseRouteAnim(value: unknown): RouteAnimType | undefined {
  if (typeof value !== 'string' || !animPresetRegistry.has(value)) return undefined
  return value
}

const COVER_FORWARD: ClassNames = {
  enter: BASE,
  enterActive: 'slide-next-enter',
  exit: BASE,
  exitActive: 'slide-prev-leave-cover',
}

const COVER_BACK: ClassNames = {
  enter: `${BASE} fr-enter-below`,
  enterActive: 'slide-prev-enter-cover',
  exit: BASE,
  exitActive: 'slide-next-leave',
}

const SLIDE_FORWARD: ClassNames = {
  enter: BASE,
  enterActive: 'slide-next-enter',
  exit: BASE,
  exitActive: 'slide-prev-leave-slide',
}

const SLIDE_BACK: ClassNames = {
  enter: `${BASE} fr-enter-below`,
  enterActive: 'slide-prev-enter-slide',
  exit: BASE,
  exitActive: 'slide-next-leave',
}

const FADE_FORWARD: ClassNames = {
  enter: BASE,
  enterActive: 'fade-enter',
  exit: BASE,
  exitActive: 'fade-leave',
}

const FADE_BACK: ClassNames = {
  enter: `${BASE} fr-enter-below`,
  enterActive: 'fade-enter',
  exit: BASE,
  exitActive: 'fade-leave',
}

const SCALE_FORWARD: ClassNames = {
  enter: BASE,
  enterActive: 'scale-enter',
  exit: `${BASE} fr-enter-below`,
  exitActive: '',
}

const SCALE_BACK: ClassNames = {
  enter: `${BASE} fr-enter-below`,
  enterActive: '',
  exit: BASE,
  exitActive: 'scale-leave',
}

const NONE: ClassNames = {
  enter: 'none-enter',
  enterActive: '',
  exit: 'none-leave',
  exitActive: '',
}

export const MODAL_PUSH: ClassNames = {
  appear: `${BASE} fr-modal`,
  appearActive: 'slide-up-enter',
  appearDone: 'fr-modal',
  enter: `${BASE} fr-modal`,
  enterActive: 'slide-up-enter',
  enterDone: 'fr-modal',
  exit: BASE,
  exitActive: 'modal-bg-leave',
}

export const MODAL_POP: ClassNames = {
  enter: BASE,
  enterActive: 'modal-bg-enter',
  exit: `${BASE} fr-modal`,
  exitActive: 'slide-up-leave',
}

for (const preset of [
  { type: 'none', forward: NONE, back: NONE },
  { type: 'cover', forward: COVER_FORWARD, back: COVER_BACK },
  { type: 'slide', forward: SLIDE_FORWARD, back: SLIDE_BACK },
  { type: 'fade', forward: FADE_FORWARD, back: FADE_BACK },
  { type: 'scale', forward: SCALE_FORWARD, back: SCALE_BACK },
  { type: 'modal', forward: COVER_FORWARD, back: COVER_BACK },
] satisfies AnimPreset[]) {
  registerAnimPreset(preset)
}

export const DEFAULT_ANIM: RouteAnimType = 'cover'

function presetOf(type: RouteAnimType): AnimPreset {
  return animPresetRegistry.get(type) ?? animPresetRegistry.get(DEFAULT_ANIM)!
}

/** 导航方向 + 起止动画类型 → CSSTransition classNames（unplugin getMode + buildClassNames 等价） */
export function classNamesFor(nav: NavType | string, fromType: RouteAnimType, toType: RouteAnimType): ClassNames {
  if (nav === 'REPLACE') {
    if (toType !== 'cover' && toType !== 'slide' && toType !== 'fade') return NONE
    return presetOf(toType).forward
  }

  if (toType === 'none' || (fromType === 'none' && nav === 'POP')) return NONE

  if (toType === 'modal' && nav === 'PUSH') return MODAL_PUSH
  if (fromType === 'modal' && nav === 'POP') return MODAL_POP

  const type = nav === 'POP' ? fromType : toType
  const preset = presetOf(type)
  return nav === 'POP' ? preset.back : preset.forward
}

export function isAnimated(classNames: ClassNames): boolean {
  return Boolean(classNames.enterActive || classNames.exitActive)
}

// ─── 路由级动画声明（page / layout）──────────────────────────────────────────

const pageAnims = new Map<string, RouteAnimType>()
const layoutScopes = new Map<string, RouteAnimType>()

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/'
}

export function registerPageAnim(pathname: string, transition: RouteAnimType): void {
  pageAnims.set(normalizePath(pathname), transition)
}

export function unregisterPageAnim(pathname: string): void {
  pageAnims.delete(normalizePath(pathname))
}

export function pageAnim(pathname: string): RouteAnimType | undefined {
  return pageAnims.get(normalizePath(pathname))
}

export function registerLayoutScope(routeId: string, transition: RouteAnimType): void {
  layoutScopes.set(routeId, transition)
}

export function unregisterLayoutScope(routeId: string): void {
  layoutScopes.delete(routeId)
}

export function layoutScopeForMatches(matches: UIMatch[] | undefined): RouteAnimType | undefined {
  if (!matches || matches.length < 2) return undefined
  return layoutScopes.get(matches[matches.length - 2]?.id ?? '')
}

export function layoutRouteId(matches: UIMatch[], pathname: string): string | undefined {
  if (matches.length < 2) return undefined
  const leaf = matches[matches.length - 1]
  const leafPath = normalizePath(leaf.pathname)
  const curPath = normalizePath(pathname)
  const leafActive = leafPath === curPath || (leafPath !== '/' && curPath.startsWith(`${leafPath}/`))
  if (leafActive && matches.length >= 3) return matches[matches.length - 2]?.id
  return matches[matches.length - 1]?.id
}

// ─── 转场计划（导航 → classNames + duration）──────────────────────────────────

export const TRANSITION_STATE_KEY = 'transition'

const IDLE: TransitionPlan = {
  classNames: { enter: '', enterActive: '', exit: '', exitActive: '' },
  duration: 0,
}

function fromHandle(matches: RouteSnapshot['matches']): RouteAnimType | undefined {
  if (!matches?.length) return undefined
  for (let i = matches.length - 1; i >= 0; i--) {
    const raw = (matches[i]?.handle as { transition?: unknown } | undefined)?.transition
    const parsed = parseRouteAnim(raw)
    if (parsed) return parsed
  }
  return undefined
}

function fromState(state: unknown): RouteAnimType | undefined {
  if (!state || typeof state !== 'object') return undefined
  return parseRouteAnim((state as Record<string, unknown>)[TRANSITION_STATE_KEY])
}

/** 从路由快照解析动画类型 */
export function resolveAnim(snapshot: RouteSnapshot, fallback: RouteAnimType): RouteAnimType {
  return (
    fromState(snapshot.state) ??
    fromHandle(snapshot.matches) ??
    pageAnim(snapshot.path) ??
    layoutScopeForMatches(snapshot.matches) ??
    fallback
  )
}

/** 一次导航 → TransitionPlan（核心入口） */
export function planTransition(
  nav: string,
  from: RouteSnapshot,
  to: RouteSnapshot,
  fallback: RouteAnimType,
): TransitionPlan {
  const fromType = resolveAnim(from, fallback)
  const toType = resolveAnim(to, fallback)
  const classNames = classNamesFor(nav, fromType, toType)

  if (!isAnimated(classNames)) return IDLE

  return { classNames, duration: readDurationMs() }
}

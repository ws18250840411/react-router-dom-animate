import type { UIMatch } from 'react-router-dom'

import type {
  AnimPreset,
  AnimPresetRegistry,
  ClassNames,
  NavType,
  OutletMode,
  RouteAnimType,
  RouteSnapshot,
  TransitionPlan,
} from './types'

const STATE_KEY = 'transition'
const MODE_KEY = 'mode'
const TABS_KEY = 'tabs'
const TAB_INDEX_KEY = 'tabIndex'
const DEFAULT_ANIM: RouteAnimType = 'cover'
const BASE = 'fr-animating fr-anim'

let durationMs = 300

function readDurationMs(): number {
  if (typeof document === 'undefined') return durationMs
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--fr-duration').trim()
  if (!raw) return durationMs
  if (raw.endsWith('ms')) durationMs = Number.parseInt(raw, 10) || 300
  else if (raw.endsWith('s')) durationMs = Math.round(Number.parseFloat(raw) * 1000) || 300
  return durationMs
}

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

function parseRouteAnim(value: unknown): RouteAnimType | undefined {
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
  exit: `${BASE} fr-enter-below`,
  exitActive: 'slide-prev-leave-slide',
}

const SLIDE_BACK: ClassNames = {
  enter: `${BASE} fr-enter-below`,
  enterActive: 'slide-prev-enter-slide',
  exit: BASE,
  exitActive: 'slide-next-leave',
}

const TAB_SLIDE_FORWARD: ClassNames = {
  enter: BASE,
  enterActive: 'tabs-slide-enter-forward',
  exit: BASE,
  exitActive: 'tabs-slide-leave-forward',
}

const TAB_SLIDE_BACK: ClassNames = {
  enter: BASE,
  enterActive: 'tabs-slide-enter-back',
  exit: BASE,
  exitActive: 'tabs-slide-leave-back',
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

const MODAL_PUSH: ClassNames = {
  appear: `${BASE} fr-modal`,
  appearActive: 'slide-up-enter',
  appearDone: 'fr-modal',
  enter: `${BASE} fr-modal`,
  enterActive: 'slide-up-enter',
  enterDone: 'fr-modal',
  exit: BASE,
  exitActive: 'modal-bg-leave',
}

const MODAL_POP: ClassNames = {
  enter: `${BASE} fr-enter-below`,
  enterActive: '',
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

function presetOf(type: RouteAnimType): AnimPreset {
  return animPresetRegistry.get(type) ?? animPresetRegistry.get(DEFAULT_ANIM)!
}

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

function isAnimated(classNames: ClassNames): boolean {
  return Boolean(classNames.enterActive || classNames.exitActive)
}

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

function pageAnim(pathname: string): RouteAnimType | undefined {
  return pageAnims.get(normalizePath(pathname))
}

export function registerLayoutScope(routeId: string, transition: RouteAnimType): void {
  layoutScopes.set(routeId, transition)
}

export function unregisterLayoutScope(routeId: string): void {
  layoutScopes.delete(routeId)
}

function layoutScopeForMatches(matches: UIMatch[] | undefined): RouteAnimType | undefined {
  if (!matches || matches.length < 2) return undefined
  return layoutScopes.get(matches[matches.length - 2]?.id ?? '')
}

export function layoutRouteId(matches: UIMatch[], pathname: string): string | undefined {
  if (matches.length < 2) return undefined
  const leaf = matches[matches.length - 1]
  const leafPath = normalizePath(leaf.pathname)
  const curPath = normalizePath(pathname)
  const leafActive =
    leafPath === curPath || (leafPath !== '/' && curPath.startsWith(`${leafPath}/`))

  if (!leafActive && matches.length >= 3 && !leafPath.startsWith('/')) {
    return matches[matches.length - 2]?.id
  }

  if (leafActive && matches.length >= 3) return matches[matches.length - 2]?.id
  return matches[matches.length - 1]?.id
}

export function sameLayoutPage(from: RouteSnapshot, to: RouteSnapshot): boolean {
  const fromId = layoutRouteId(from.matches as UIMatch[], from.path)
  const toId = layoutRouteId(to.matches as UIMatch[], to.path)
  return fromId !== undefined && fromId === toId
}

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
  return parseRouteAnim((state as Record<string, unknown>)[STATE_KEY])
}

function parseOutletMode(value: unknown): OutletMode | undefined {
  if (value === 'stack' || value === 'switch') return value
  return undefined
}

function modeFromHandle(matches: RouteSnapshot['matches']): OutletMode | undefined {
  if (!matches?.length) return undefined
  for (let i = matches.length - 1; i >= 0; i--) {
    const parsed = parseOutletMode((matches[i]?.handle as { mode?: unknown } | undefined)?.mode)
    if (parsed) return parsed
  }
  return undefined
}

function modeFromState(state: unknown): OutletMode | undefined {
  if (!state || typeof state !== 'object') return undefined
  return parseOutletMode((state as Record<string, unknown>)[MODE_KEY])
}

export function resolveOutletMode(
  prop: OutletMode | undefined,
  matches: RouteSnapshot['matches'],
  state: unknown,
  tabs?: boolean,
): OutletMode {
  if (tabs) return 'switch'
  return prop ?? modeFromState(state) ?? modeFromHandle(matches) ?? 'stack'
}

function tabsFromState(state: unknown): boolean | undefined {
  if (!state || typeof state !== 'object') return undefined
  const raw = (state as Record<string, unknown>)[TABS_KEY]
  return raw === true ? true : undefined
}

export function resolveTabs(
  prop: boolean | undefined,
  state: unknown,
  depth: number,
): boolean {
  if (prop !== undefined) return prop
  if (depth > 0 && tabsFromState(state)) return true
  return false
}

function tabIndexFromSnapshot(snap: RouteSnapshot): number {
  if (snap.state && typeof snap.state === 'object') {
    const idx = (snap.state as Record<string, unknown>)[TAB_INDEX_KEY]
    if (typeof idx === 'number') return idx
  }
  for (let i = snap.matches.length - 1; i >= 0; i--) {
    const idx = (snap.matches[i]?.handle as { tabIndex?: unknown } | undefined)?.tabIndex
    if (typeof idx === 'number') return idx
  }
  const leaf = normalizePath(snap.path).split('/').pop() ?? snap.path
  return leaf.charCodeAt(0)
}

function classNamesForTabs(from: RouteSnapshot, to: RouteSnapshot, fallback: RouteAnimType): ClassNames {
  const anim = resolveAnim(to, fallback)
  if (anim === 'slide') {
    const fromIdx = tabIndexFromSnapshot(from)
    const toIdx = tabIndexFromSnapshot(to)
    return toIdx > fromIdx ? TAB_SLIDE_FORWARD : TAB_SLIDE_BACK
  }
  if (anim === 'fade') return FADE_FORWARD
  return classNamesFor('REPLACE', resolveAnim(from, fallback), anim)
}

export function resolveAnim(snapshot: RouteSnapshot, fallback: RouteAnimType): RouteAnimType {
  return (
    fromState(snapshot.state) ??
    fromHandle(snapshot.matches) ??
    pageAnim(snapshot.path) ??
    layoutScopeForMatches(snapshot.matches) ??
    fallback
  )
}

export function planTransition(
  nav: string,
  from: RouteSnapshot,
  to: RouteSnapshot,
  fallback: RouteAnimType,
  options?: { tabs?: boolean },
): TransitionPlan {
  if (normalizePath(from.path) === normalizePath(to.path)) return IDLE

  const fromType = resolveAnim(from, fallback)
  const toType = resolveAnim(to, fallback)
  const classNames = options?.tabs
    ? classNamesForTabs(from, to, fallback)
    : classNamesFor(nav, fromType, toType)

  if (!isAnimated(classNames)) return IDLE

  return { classNames, duration: readDurationMs() }
}

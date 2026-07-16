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
const TAB_INDEX_KEY = 'tabIndex'
const DEFAULT_ANIM: RouteAnimType = 'cover'
const BASE = 'fr-animating fr-anim'

let durationMs = 300
let durationCached = false
const typedDurationCache = new Map<string, number>()

function parseCssMs(raw: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(raw)
  if (!match) return undefined
  const value = Number.parseFloat(match[1]) * (match[2] === 's' ? 1000 : 1)
  return Number.isFinite(value) ? Math.round(value) : undefined
}

function normalizeDurationMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError('Animation duration must be a finite, non-negative number.')
  }
  return Math.round(ms)
}

/**
 * Read --fr-duration from the document root's computed style.
 * Only caches the result when a non-empty value is found, so that external
 * stylesheets loaded after the JS bundle are still picked up on the first
 * navigation (no manual `warmDurationMs()` call required).
 */
function readDurationMs(): number {
  if (durationCached || typeof document === 'undefined') return durationMs
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--fr-duration').trim()
  const parsed = parseCssMs(raw)
  if (parsed !== undefined) {
    durationMs = parsed
    durationCached = true
  }
  return durationMs
}

/**
 * Read --fr-duration-{type} for a specific animation type, falling back to
 * --fr-duration if the per-type variable is not set.
 *
 * Values are cached only once a non-empty CSS variable is found, so external
 * stylesheets loaded after the JS bundle are still picked up.
 *
 * Example:
 *   --fr-duration: 300ms;
 *   --fr-duration-modal: 450ms;
 */
function readTypedDurationMs(type: RouteAnimType): number {
  if (typeof document === 'undefined') return readDurationMs()
  if (typedDurationCache.has(type)) return typedDurationCache.get(type)!
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--fr-duration-${type}`).trim()
  const parsed = parseCssMs(raw)
  if (parsed !== undefined) {
    typedDurationCache.set(type, parsed)
    return parsed
  }
  return readDurationMs()
}

/**
 * Eagerly reads and caches --fr-duration and per-type CSS variables.
 * Call this once after all stylesheets have loaded if you use external CSS
 * `<link>` files and want to avoid a `getComputedStyle` call on the first
 * navigation. In most bundler setups (Vite, webpack) this is unnecessary.
 */
export function warmDurationMs(): void {
  readDurationMs()
  for (const type of animPresetRegistry.types()) {
    readTypedDurationMs(type)
  }
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
  if (!preset.type.trim()) throw new TypeError('Animation preset type must not be empty.')
  animPresetRegistry.register({
    ...preset,
    durationMs: preset.durationMs === undefined
      ? undefined
      : normalizeDurationMs(preset.durationMs),
  })
}

/**
 * Override the animation duration for a specific type without replacing its
 * CSS class names. Useful for tuning built-in presets in JS.
 *
 * This is the JS equivalent of `--fr-duration-{type}` CSS variables and takes
 * priority over them. Prefer CSS variables when possible.
 *
 * @example
 *   setAnimDuration('modal', 450)
 *   setAnimDuration('slide', 250)
 */
export function setAnimDuration(type: RouteAnimType, ms: number): void {
  const duration = normalizeDurationMs(ms)
  const existing = presets.get(type)
  if (existing) presets.set(type, { ...existing, durationMs: duration })
  typedDurationCache.set(type, duration)
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

// Tab-aware cover preset: pre-positions entering page off-screen to avoid the
// one-frame flash at position 0 before slide-next-enter kicks in (KeepAliveRoot
// uses mountOnEnter=false so the page is in the DOM during the two-render trick).
const TAB_COVER_FORWARD: ClassNames = {
  enter: `${BASE} fr-tab-pre-enter-right`,
  enterActive: 'slide-next-enter',
  exit: BASE,
  exitActive: 'slide-prev-leave-cover',
}

// Tab-aware cover backward (iOS-style pop): entering page (lower index, e.g. "home")
// emerges from the scaled background while the exiting page slides off to the right.
// This is the natural reverse of TAB_COVER_FORWARD:
//   forward  = entering page covers  (slides in from right, exit scales to bg)
//   backward = entering page reveals (emerges from bg, exit slides to right)
// fr-tab-pre-enter-below pre-positions the entering page at the same scaled/faded
// state as the slide-prev-enter-cover animation's from-keyframe to avoid a one-frame
// flash in keepAlive mode where the page is always in the DOM.
const TAB_COVER_BACK: ClassNames = {
  enter: `${BASE} fr-enter-below fr-tab-pre-enter-below`,
  enterActive: 'slide-prev-enter-cover',
  exit: BASE,
  exitActive: 'slide-next-leave',
}

// Tab-aware modal: used for ALL modal tab switches (both forward and backward).
// New tab always slides UP from the bottom; old tab always slides DOWN off-screen.
// This gives clear, consistent double-sided animation for every tab switch, so every
// menu item visibly animates regardless of navigation direction.
// enterDone is intentionally empty (not 'fr-modal') so the tab page stays fully opaque
// after animation — fr-modal:not(.fr-animating) makes the page background transparent,
// which is correct for overlay modals in stack mode but wrong for full-content tab pages.
const TAB_MODAL_PUSH: ClassNames = {
  appear: `${BASE} fr-modal fr-tab-pre-enter-bottom`,
  appearActive: 'slide-up-enter',
  appearDone: '',
  enter: `${BASE} fr-modal fr-tab-pre-enter-bottom`,
  enterActive: 'slide-up-enter',
  enterDone: '',
  exit: BASE,
  exitActive: 'slide-up-leave',
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
  enter: `${BASE} fr-tab-pre-enter-right`,
  enterActive: 'tabs-slide-enter-forward',
  exit: BASE,
  exitActive: 'tabs-slide-leave-forward',
}

const TAB_SLIDE_BACK: ClassNames = {
  enter: `${BASE} fr-tab-pre-enter-left`,
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

// Tab-aware scale: entering page pre-positioned at the animation's `from` state
// (opacity 0, scale 0.92) so it doesn't flash at full size before scaling in.
const TAB_SCALE_FORWARD: ClassNames = {
  enter: `${BASE} fr-tab-pre-enter-scale`,
  enterActive: 'scale-enter',
  exit: `${BASE} fr-enter-below`,
  exitActive: '',
}

// Tab-aware fade: entering page pre-positioned at opacity 0 so it doesn't flash
// fully visible before the fade-in animation begins.
const TAB_FADE_FORWARD: ClassNames = {
  enter: `${BASE} fr-tab-pre-enter-fade`,
  enterActive: 'fade-enter',
  exit: BASE,
  exitActive: 'fade-leave',
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
  {
    type: 'cover',
    forward: COVER_FORWARD,
    back: COVER_BACK,
    tab: { forward: TAB_COVER_FORWARD, back: TAB_COVER_BACK },
  },
  {
    type: 'slide',
    forward: SLIDE_FORWARD,
    back: SLIDE_BACK,
    // Without tabIndex the direction is unknown: degrade to fade-with-pre-enter rather than
    // sliding in a potentially wrong direction. TAB_FADE_FORWARD is used (not FADE_FORWARD)
    // so the entering page starts at opacity:0 and avoids the one-frame flash.
    tab: { forward: TAB_SLIDE_FORWARD, back: TAB_SLIDE_BACK, undirected: TAB_FADE_FORWARD },
  },
  {
    type: 'fade',
    forward: FADE_FORWARD,
    back: FADE_BACK,
    // Symmetric in tab context — same animation regardless of direction.
    tab: { forward: TAB_FADE_FORWARD },
  },
  {
    type: 'scale',
    forward: SCALE_FORWARD,
    back: SCALE_BACK,
    // Symmetric in tab context: entering page always scales in.
    tab: { forward: TAB_SCALE_FORWARD },
  },
  {
    type: 'modal',
    forward: MODAL_PUSH,
    back: MODAL_POP,
    // Modal tabs: always push up regardless of direction (bidirectional).
    tab: { forward: TAB_MODAL_PUSH, bidirectional: true },
  },
] satisfies AnimPreset[]) {
  registerAnimPreset(preset)
}

function presetOf(type: RouteAnimType): AnimPreset {
  const preset = animPresetRegistry.get(type)
  if (!preset) {
    // Unknown animation type — likely a typo (e.g. "node" instead of "none").
    // Warn in any environment so misconfiguration is caught early in development.
    console.warn(
      `[react-router-dom-animate] Unknown animation type "${type}". ` +
      `Falling back to "${DEFAULT_ANIM}". ` +
      `Register it with registerAnimPreset() or check for typos.`,
    )
    return animPresetRegistry.get(DEFAULT_ANIM)!
  }
  return preset
}

export function classNamesFor(nav: NavType | string, fromType: RouteAnimType, toType: RouteAnimType): ClassNames {
  if (nav === 'REPLACE') {
    if (toType === 'modal' || toType === 'none') return NONE
    const forward = presetOf(toType).forward
    return isAnimated(forward) ? forward : NONE
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

/**
 * Module-level singletons for page/layout animation overrides.
 *
 * **Browser only**: this library targets browser environments. Do not use in
 * SSR (Node.js / Deno) without a module-per-request isolation strategy.
 *
 * In typical bundler SSR setups (Vite, webpack) each server worker gets its
 * own module instance, so these singletons are implicitly request-scoped.
 * In shared-module setups (e.g. module federation without SSR isolation)
 * these maps persist across requests — register/unregister still happens
 * symmetrically (mount → register, unmount → unregister) so contamination
 * is limited to the window between mount and unmount.
 */
const pageAnims = new Map<string, RouteAnimType[]>()
const layoutScopes = new Map<string, RouteAnimType[]>()

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/'
}

export function registerPageAnim(pathname: string, transition: RouteAnimType): void {
  const key = normalizePath(pathname)
  pageAnims.set(key, [...(pageAnims.get(key) ?? []), transition])
}

export function unregisterPageAnim(pathname: string, transition: RouteAnimType): void {
  unregisterOverride(pageAnims, normalizePath(pathname), transition)
}

function pageAnim(pathname: string): RouteAnimType | undefined {
  const values = pageAnims.get(normalizePath(pathname))
  return values?.[values.length - 1]
}

export function registerLayoutScope(routeId: string, transition: RouteAnimType): void {
  layoutScopes.set(routeId, [...(layoutScopes.get(routeId) ?? []), transition])
}

export function unregisterLayoutScope(routeId: string, transition: RouteAnimType): void {
  unregisterOverride(layoutScopes, routeId, transition)
}

function unregisterOverride(
  registry: Map<string, RouteAnimType[]>,
  key: string,
  transition: RouteAnimType,
): void {
  const values = registry.get(key)
  if (!values) return
  const index = values.lastIndexOf(transition)
  if (index >= 0) values.splice(index, 1)
  if (values.length === 0) registry.delete(key)
}

function layoutScopeForMatches(matches: UIMatch[] | undefined): RouteAnimType | undefined {
  if (!matches || matches.length < 2) return undefined
  const values = layoutScopes.get(matches[matches.length - 2]?.id ?? '')
  return values?.[values.length - 1]
}

export function layoutRouteId(matches: UIMatch[], pathname: string): string | undefined {
  if (matches.length < 2) return undefined
  const leaf = matches[matches.length - 1]
  const leafPath = normalizePath(leaf.pathname)
  const curPath = normalizePath(pathname)
  const leafActive =
    leafPath === curPath || (leafPath !== '/' && curPath.startsWith(`${leafPath}/`))

  // leafPath may be a relative segment (e.g. 'a') when the leaf route is defined with a relative
  // path inside a nested layout. In that case the parent layout's id is the correct scope id.
  if (!leafActive && matches.length >= 3 && !leafPath.startsWith('/')) {
    return matches[matches.length - 2]?.id
  }

  // When the leaf route path doesn't match the current pathname, the matches
  // come from a different route (e.g. useMatches() returns the live global
  // state while useLocation().pathname is frozen inside a keepBackground entry).
  // Returning undefined here lets pageTransitionKey fall back to locationKey,
  // which is stable for the frozen entry and prevents TransitionGroup from
  // re-keying its child and destroying the kept-alive DOM.
  if (!leafActive) return undefined

  if (matches.length >= 3) return matches[matches.length - 2]?.id
  return matches[matches.length - 1]?.id
}

function pathDepth(path: string): number {
  const n = normalizePath(path)
  return n === '/' ? 0 : n.split('/').filter(Boolean).length
}

export function sameLayoutPage(from: RouteSnapshot, to: RouteSnapshot): boolean {
  const fromId = layoutRouteId(from.matches as UIMatch[], from.path)
  const toId = layoutRouteId(to.matches as UIMatch[], to.path)
  if (fromId === undefined || fromId !== toId) return false
  return pathDepth(from.path) === pathDepth(to.path)
}

export const IDLE: TransitionPlan = {
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
): OutletMode {
  return prop ?? modeFromState(state) ?? modeFromHandle(matches) ?? 'stack'
}

function tabIndexFromSnapshot(snap: RouteSnapshot): number | undefined {
  if (snap.state && typeof snap.state === 'object') {
    const idx = (snap.state as Record<string, unknown>)[TAB_INDEX_KEY]
    if (typeof idx === 'number') return idx
  }
  for (let i = snap.matches.length - 1; i >= 0; i--) {
    const idx = (snap.matches[i]?.handle as { tabIndex?: unknown } | undefined)?.tabIndex
    if (typeof idx === 'number') return idx
  }
  return undefined
}

/**
 * Resolve ClassNames for keepAlive switch-mode (tab) navigation.
 *
 * Uses `preset.tab` when available, making the logic fully generic — no
 * per-type hardcoding required. Custom presets registered via
 * `registerAnimPreset` automatically get correct tab behaviour as long as
 * they define `tab.forward` (with the appropriate `fr-tab-pre-enter-*` class
 * to prevent the one-frame flash in keepAlive mode).
 *
 * Decision order:
 *   1. Bidirectional preset  → always `tab.forward`
 *   2. Known tabIndex direction → `tab.forward` or `tab.back`
 *   3. No tabIndex            → `tab.undirected` → `tab.forward`
 *   4. No `tab` field at all  → REPLACE classNames fallback (backward compat
 *      for custom presets registered before the tab field was introduced)
 */
function classNamesForTabs(from: RouteSnapshot, to: RouteSnapshot, fallback: RouteAnimType): ClassNames {
  const anim = resolveAnim(to, fallback)
  const preset = presetOf(anim)
  const tab = preset.tab
  const fromIdx = tabIndexFromSnapshot(from)
  const toIdx = tabIndexFromSnapshot(to)

  if (!tab) {
    return classNamesFor('REPLACE', resolveAnim(from, fallback), anim)
  }

  if (tab.bidirectional) return tab.forward

  if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx) {
    return toIdx > fromIdx ? tab.forward : (tab.back ?? tab.forward)
  }

  return tab.undirected ?? tab.forward
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
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) return IDLE

  const fromType = resolveAnim(from, fallback)
  const toType = resolveAnim(to, fallback)
  const classNames = options?.tabs
    ? classNamesForTabs(from, to, fallback)
    : classNamesFor(nav, fromType, toType)

  if (!isAnimated(classNames)) return IDLE

  const activeType = options?.tabs ? toType : nav === 'POP' ? fromType : toType
  const duration = animPresetRegistry.get(activeType)?.durationMs ?? readTypedDurationMs(activeType)
  if (duration <= 0) return IDLE

  return { classNames, duration }
}

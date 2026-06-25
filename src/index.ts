export { default as AnimatedOutlet } from './outlet'
export type { AnimatedOutletProps } from './outlet'

export {
  useAnimatedNavigate,
  withTransition,
  linkTransition,
  type AnimatedNavigate,
  type AnimatedNavigateOptions,
} from './navigate'

export {
  planTransition,
  resolveAnim,
  classNamesFor,
  isAnimated,
  registerAnimPreset,
  animPresetRegistry,
  parseRouteAnim,
  DEFAULT_ANIM,
  TRANSITION_STATE_KEY,
  registerPageAnim,
  unregisterPageAnim,
  registerLayoutScope,
  unregisterLayoutScope,
  layoutScopeForMatches,
  layoutRouteId,
  pageAnim,
  readDurationMs,
} from './transition'

export type {
  RouteAnimType,
  NavType,
  ClassNames,
  RouteSnapshot,
  TransitionPlan,
  AnimPreset,
  AnimPresetRegistry,
} from './types'

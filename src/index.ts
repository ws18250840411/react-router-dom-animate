import './anim.css'

import { warmDurationMs } from './transition'

warmDurationMs()

export { default as AnimatedOutlet, KeepAlive, useActivated, useDeactivated } from './outlet'
export type { AnimatedOutletProps, KeepAliveProps } from './outlet'

export { registerAnimPreset, setAnimDuration, warmDurationMs } from './transition'

export type { RouteAnimType, AnimPreset, TabPreset, ClassNames, OutletMode, KeepAliveRef, KeepAliveFilter } from './types'

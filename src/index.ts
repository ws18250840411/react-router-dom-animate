import './anim.css'

import { warmDurationMs } from './transition'

warmDurationMs()

export { default as AnimatedOutlet, useActivated, useDeactivated } from './outlet'
export type { AnimatedOutletProps } from './outlet'

export { registerAnimPreset, setAnimDuration, warmDurationMs } from './transition'

export type { RouteAnimType, AnimPreset, ClassNames, OutletMode, KeepAliveRef } from './types'

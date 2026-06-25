/**
 * 转场中 defer navigate — 语义同 Vue Router 导航守卫里延迟调用 next()。
 * @see https://router.vuejs.org/guide/advanced/navigation-guards.html
 */
import { createContext, useContext } from 'react'
import type { To } from 'react-router-dom'

import type { AnimatedNavigateOptions } from './navigate'

export type PendingNav =
  | { kind: 'delta'; delta: number }
  | { kind: 'to'; to: To; options?: AnimatedNavigateOptions }

export interface NavigateQueueApi {
  runOrEnqueue: (item: PendingNav) => void
}

export const NavigateQueueContext = createContext<NavigateQueueApi | null>(null)

export function useNavigateQueue(): NavigateQueueApi | null {
  return useContext(NavigateQueueContext)
}

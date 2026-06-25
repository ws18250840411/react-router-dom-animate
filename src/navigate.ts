import { useCallback, useMemo } from 'react'
import { useNavigate, type NavigateFunction, type NavigateOptions, type To } from 'react-router-dom'

import { useNavigateQueue, type PendingNav } from './navigate-queue'
import type { RouteAnimType } from './types'
import { TRANSITION_STATE_KEY } from './transition'

export type AnimatedNavigateOptions = NavigateOptions & {
  transition?: RouteAnimType
}

export type AnimatedNavigate = {
  (to: To, options?: AnimatedNavigateOptions): void
  (delta: number): void
  push: (to: To, options?: AnimatedNavigateOptions) => void
  replace: (to: To, options?: AnimatedNavigateOptions) => void
  back: () => void
}

export function withTransition(transition: RouteAnimType, options?: NavigateOptions): NavigateOptions {
  const { state, ...rest } = options ?? {}
  return {
    ...rest,
    state: { ...(state as Record<string, unknown> | undefined), [TRANSITION_STATE_KEY]: transition },
  }
}

export function linkTransition(transition: RouteAnimType): { state: Record<string, unknown> } {
  return { state: { [TRANSITION_STATE_KEY]: transition } }
}

function goWithTransition(
  navigate: NavigateFunction,
  to: To,
  { transition, state, ...options }: AnimatedNavigateOptions = {},
): void {
  navigate(
    to,
    transition !== undefined ? withTransition(transition, { ...options, state }) : { ...options, state },
  )
}

export function executePendingNav(navigate: NavigateFunction, item: PendingNav): void {
  if (item.kind === 'delta') {
    navigate(item.delta)
    return
  }
  goWithTransition(navigate, item.to, item.options)
}

export function useAnimatedNavigate(): AnimatedNavigate {
  const navigate = useNavigate()
  const queue = useNavigateQueue()

  const dispatch = useCallback(
    (item: PendingNav) => {
      if (queue) queue.runOrEnqueue(item)
      else executePendingNav(navigate, item)
    },
    [navigate, queue],
  )

  return useMemo(() => {
    const api = ((to: To | number, options?: AnimatedNavigateOptions) => {
      if (typeof to === 'number') dispatch({ kind: 'delta', delta: to })
      else dispatch({ kind: 'to', to, options })
    }) as AnimatedNavigate
    api.push = (to, options) => dispatch({ kind: 'to', to, options })
    api.replace = (to, options) => dispatch({ kind: 'to', to, options: { ...options, replace: true } })
    api.back = () => dispatch({ kind: 'delta', delta: -1 })
    return api
  }, [dispatch])
}

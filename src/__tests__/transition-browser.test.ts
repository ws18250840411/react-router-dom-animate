/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'

import { planTransition, registerAnimPreset } from '../transition'
import type { RouteSnapshot } from '../types'

function snap(path: string, transition?: string): RouteSnapshot {
  return {
    path,
    key: path,
    state: transition ? { transition } : null,
    matches: [],
  }
}

afterEach(() => {
  document.documentElement.style.removeProperty('--fr-duration-zero-css')
})

describe('浏览器动画时长', () => {
  it('CSS 变量 0ms 会禁用动画而不是回退到默认时长', () => {
    registerAnimPreset({
      type: 'zero-css',
      forward: {
        enter: 'fr-animating fr-anim',
        enterActive: 'fade-enter',
        exit: 'fr-animating fr-anim',
        exitActive: 'fade-leave',
      },
      back: {
        enter: 'fr-animating fr-anim',
        enterActive: 'fade-enter',
        exit: 'fr-animating fr-anim',
        exitActive: 'fade-leave',
      },
    })
    document.documentElement.style.setProperty('--fr-duration-zero-css', '0ms')

    expect(planTransition('PUSH', snap('/a'), snap('/b', 'zero-css'), 'cover').duration).toBe(0)
  })
})

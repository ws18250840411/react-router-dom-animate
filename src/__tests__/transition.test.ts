import { describe, expect, it } from 'vitest'

import {
  animPresetRegistry,
  classNamesFor,
  planTransition,
  registerAnimPreset,
  resolveAnim,
} from '../transition'
import type { RouteSnapshot } from '../types'

function snap(path: string, key = path, state: unknown = null): RouteSnapshot {
  return { path, key, state, matches: [] }
}

describe('resolveAnim', () => {
  it('state.transition 优先级最高', () => {
    expect(resolveAnim(snap('/a', 'a', { transition: 'fade' }), 'cover')).toBe('fade')
  })

  it('route handle 从叶子往祖先匹配', () => {
    const matches = [
      { id: 'root', pathname: '/', handle: undefined },
      { id: 'modal', pathname: '/modal', handle: { transition: 'modal' } },
    ] as never
    expect(resolveAnim({ path: '/modal', key: 'm', state: null, matches }, 'cover')).toBe('modal')
  })
})

describe('classNamesFor', () => {
  it('PUSH modal → slide-up', () => {
    const cn = classNamesFor('PUSH', 'cover', 'modal')
    expect(cn.enter).toContain('fr-modal')
    expect(cn.enterActive).toBe('slide-up-enter')
  })

  it('POP from modal → slide-down', () => {
    const cn = classNamesFor('POP', 'modal', 'cover')
    expect(cn.exit).toContain('fr-modal')
    expect(cn.exitActive).toBe('slide-up-leave')
  })

  describe('PUSH', () => {
    it('cover 默认前进', () => {
      const cn = classNamesFor('PUSH', 'cover', 'cover')
      expect(cn.enterActive).toBe('slide-next-enter')
      expect(cn.exitActive).toBe('slide-prev-leave-cover')
    })
    it('none 禁用', () => {
      const cn = classNamesFor('PUSH', 'cover', 'none')
      expect(cn.enter).toBe('none-enter')
    })
  })

  describe('POP', () => {
    it('cover 默认后退', () => {
      const cn = classNamesFor('POP', 'cover', 'cover')
      expect(cn.enter).toContain('fr-enter-below')
      expect(cn.exitActive).toBe('slide-next-leave')
    })
    it('from none 禁用', () => {
      const cn = classNamesFor('POP', 'none', 'cover')
      expect(cn.enter).toBe('none-enter')
    })
  })

  describe('REPLACE', () => {
    it('modal 无动画', () => {
      expect(classNamesFor('REPLACE', 'cover', 'modal').enter).toBe('none-enter')
    })
    it('fade 交叉淡入淡出', () => {
      const cn = classNamesFor('REPLACE', 'fade', 'fade')
      expect(cn.enterActive).toBe('fade-enter')
      expect(cn.exitActive).toBe('fade-leave')
    })
  })
})

describe('planTransition', () => {
  const types = ['cover', 'slide', 'fade'] as const

  it('custom preset 通过 forward/back 注册', () => {
    registerAnimPreset({
      type: 'flip',
      forward: { enter: 'a', enterActive: 'flip-in', exit: 'b', exitActive: 'flip-out-fwd' },
      back: { enter: 'c', enterActive: '', exit: 'd', exitActive: 'flip-out-back' },
    })
    expect(animPresetRegistry.has('flip')).toBe(true)
    const { classNames } = planTransition('PUSH', snap('/a'), snap('/b', 'b', { transition: 'flip' }), 'cover')
    expect(classNames.enterActive).toBe('flip-in')
  })

  it('PUSH + state.transition=slide', () => {
    const { classNames } = planTransition(
      'PUSH',
      snap('/a'),
      snap('/b', 'b', { transition: 'slide' }),
      'cover',
    )
    expect(classNames.exitActive).toBe('slide-prev-leave-slide')
  })

  it('POP 从 state 读离场动画类型', () => {
    const { classNames } = planTransition(
      'POP',
      snap('/b', 'b', { transition: 'slide' }),
      snap('/a'),
      'cover',
    )
    expect(classNames.enterActive).toBe('slide-prev-enter-slide')
  })

  it('modal PUSH', () => {
    const { classNames } = planTransition(
      'PUSH',
      snap('/home'),
      snap('/pay', 'pay', { transition: 'modal' }),
      'cover',
    )
    expect(classNames.enterActive).toBe('slide-up-enter')
    expect(classNames.exitActive).toBe('modal-bg-leave')
  })

  it('modal POP', () => {
    const { classNames } = planTransition(
      'POP',
      snap('/pay', 'pay', { transition: 'modal' }),
      snap('/home'),
      'cover',
    )
    expect(classNames.exitActive).toBe('slide-up-leave')
    expect(classNames.enterActive).toBe('modal-bg-enter')
  })

  it('scale PUSH 仅 enter', () => {
    const { classNames } = planTransition(
      'PUSH',
      snap('/a'),
      snap('/b', 'b', { transition: 'scale' }),
      'cover',
    )
    expect(classNames.enterActive).toBe('scale-enter')
    expect(classNames.exitActive).toBe('')
    expect(classNames.exit).toContain('fr-enter-below')
  })

  it('scale POP 仅 exit', () => {
    const { classNames } = planTransition(
      'POP',
      snap('/b', 'b', { transition: 'scale' }),
      snap('/a'),
      'cover',
    )
    expect(classNames.enterActive).toBe('')
    expect(classNames.exitActive).toBe('scale-leave')
  })

  it('REPLACE + fade fallback', () => {
    const { classNames } = planTransition('REPLACE', snap('/home'), snap('/profile'), 'fade')
    expect(classNames.enterActive).toBe('fade-enter')
    expect(classNames.exitActive).toBe('fade-leave')
  })

  it('不含 fr-exit-on-top', () => {
    for (const nav of ['PUSH', 'POP'] as const) {
      for (const type of types) {
        const from = nav === 'POP' ? snap('/b', 'b', { transition: type }) : snap('/a')
        const to = nav === 'PUSH' ? snap('/b', 'b', { transition: type }) : snap('/a')
        const { classNames } = planTransition(nav, from, to, type)
        expect(classNames.enter).not.toContain('fr-exit-on-top')
        expect(classNames.exit).not.toContain('fr-exit-on-top')
      }
    }
  })

  it('PUSH modal 含 enterDone 保留 fr-modal', () => {
    const cn = classNamesFor('PUSH', 'cover', 'modal')
    expect(cn.enterDone).toBe('fr-modal')
  })

  it('modal PUSH via route handle', () => {
    const matches = [{ id: 'modal', pathname: '/modal', handle: { transition: 'modal' } }] as never
    const { classNames } = planTransition(
      'PUSH',
      snap('/'),
      { path: '/modal', key: 'm', state: null, matches },
      'cover',
    )
    expect(classNames.enterActive).toBe('slide-up-enter')
    expect(classNames.exitActive).toBe('modal-bg-leave')
    expect(classNames.enterDone).toBe('fr-modal')
  })

  it('modal 不受 fade fallback 影响', () => {
    const push = planTransition(
      'PUSH',
      snap('/home'),
      snap('/pay', 'pay', { transition: 'modal' }),
      'fade',
    )
    expect(push.classNames.enterActive).toBe('slide-up-enter')

    const pop = planTransition(
      'POP',
      snap('/pay', 'pay', { transition: 'modal' }),
      snap('/home'),
      'fade',
    )
    expect(pop.classNames.exitActive).toBe('slide-up-leave')
  })
})

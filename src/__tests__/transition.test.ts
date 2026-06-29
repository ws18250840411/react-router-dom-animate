import { describe, expect, it } from 'vitest'

import {
  animPresetRegistry,
  classNamesFor,
  planTransition,
  registerAnimPreset,
  resolveAnim,
  resolveOutletMode,
  resolveTabs,
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

describe('resolveOutletMode', () => {
  it('prop 优先于 state 与 handle', () => {
    const matches = [{ id: 'tabs', handle: { mode: 'switch' } }] as never
    expect(resolveOutletMode('stack', matches, { mode: 'switch' })).toBe('stack')
  })

  it('tabs 强制 switch', () => {
    expect(resolveOutletMode('stack', [], null, true)).toBe('switch')
  })

  it('state.mode 优先于 handle', () => {
    const matches = [{ id: 'tabs', handle: { mode: 'stack' } }] as never
    expect(resolveOutletMode(undefined, matches, { mode: 'switch' })).toBe('switch')
  })

  it('handle.mode 兜底', () => {
    const matches = [{ id: 'tabs', handle: { mode: 'switch' } }] as never
    expect(resolveOutletMode(undefined, matches, null)).toBe('switch')
  })

  it('默认 stack', () => {
    expect(resolveOutletMode(undefined, [], null)).toBe('stack')
  })
})

describe('resolveTabs', () => {
  it('prop 优先', () => {
    expect(resolveTabs(false, { tabs: true }, 1)).toBe(false)
  })

  it('嵌套 Outlet 可读 state.tabs', () => {
    expect(resolveTabs(undefined, { tabs: true }, 1)).toBe(true)
  })

  it('根 Outlet 忽略 state.tabs', () => {
    expect(resolveTabs(undefined, { tabs: true }, 0)).toBe(false)
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
    expect(classNames.exit).toContain('fr-enter-below')
    expect(classNames.enterActive).toBe('slide-next-enter')
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
    expect(classNames.enterActive).toBe('')
    expect(classNames.enter).toContain('fr-enter-below')
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

  it('同 pathname 重复导航返回 IDLE', () => {
    const plan = planTransition('REPLACE', snap('/tabs/a', 'k1'), snap('/tabs/a', 'k2'), 'fade')
    expect(plan.duration).toBe(0)
    expect(plan.classNames.enterActive).toBe('')
  })

  it('tabs slide A→B 右进', () => {
    const tabSnap = (path: string, tabIndex: number, key = path) =>
      ({ path, key, state: null, matches: [{ handle: { tabIndex } }] }) as never
    const { classNames } = planTransition(
      'REPLACE',
      tabSnap('/tabs/a', 0),
      tabSnap('/tabs/b', 1),
      'slide',
      { tabs: true },
    )
    expect(classNames.enterActive).toBe('tabs-slide-enter-forward')
    expect(classNames.exitActive).toBe('tabs-slide-leave-forward')
  })

  it('tabs slide B→A 左进', () => {
    const tabSnap = (path: string, tabIndex: number, key = path) =>
      ({ path, key, state: null, matches: [{ handle: { tabIndex } }] }) as never
    const { classNames } = planTransition(
      'REPLACE',
      tabSnap('/tabs/b', 1),
      tabSnap('/tabs/a', 0),
      'slide',
      { tabs: true },
    )
    expect(classNames.enterActive).toBe('tabs-slide-enter-back')
    expect(classNames.exitActive).toBe('tabs-slide-leave-back')
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

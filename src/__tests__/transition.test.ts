import { describe, expect, it, vi } from 'vitest'

import {
  animPresetRegistry,
  classNamesFor,
  planTransition,
  registerAnimPreset,
  resolveAnim,
  resolveOutletMode,
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

  it('tabs + none 同 pathname 不同 key 返回 IDLE', () => {
    const plan = planTransition('REPLACE', snap('/tabs/a', 'k1'), snap('/tabs/a', 'k2'), 'none', {
      tabs: true,
    })
    expect(plan.duration).toBe(0)
    expect(plan.classNames.enterActive).toBe('')
    expect(plan.classNames.exitActive).toBe('')
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

describe('presetOf — 未知动画类型警告', () => {
  it('使用未注册的 type 时触发 console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    classNamesFor('PUSH', 'cover', 'typo-anim' as never)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('typo-anim')
    expect(warn.mock.calls[0][0]).toContain('react-router-dom-animate')
    warn.mockRestore()
  })

  it('未知 type 回退为 cover 动画（不崩溃）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cn = classNamesFor('PUSH', 'cover', 'non-existent' as never)
    expect(cn.enterActive).toBe('slide-next-enter') // cover forward 的 enterActive
    warn.mockRestore()
  })

  it('planTransition fallback 为未知 type 时也会警告并正常返回 plan', () => {
    // state.transition 会被 parseRouteAnim 过滤（未注册则忽略），
    // 但直接用未知 type 作为 fallback 会透传到 presetOf。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const plan = planTransition(
      'PUSH',
      snap('/a'),
      snap('/b'),        // 无 state/handle，resolveAnim 返回 fallback
      'unknown-fallback' as never,
    )
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls[0][0]).toContain('unknown-fallback')
    // 回退为 cover，动画正常
    expect(plan.classNames.enterActive).toBeTruthy()
    warn.mockRestore()
  })
})

describe('设计修复回归', () => {
  describe('REPLACE 支持 scale 和自定义 preset', () => {
    it('REPLACE + scale 触发 scale 动画（不再静默降级 NONE）', () => {
      const cn = classNamesFor('REPLACE', 'cover', 'scale')
      expect(cn.enterActive).toBe('scale-enter')
    })

    it('REPLACE + custom preset 触发自定义动画', () => {
      registerAnimPreset({
        type: 'zoom',
        forward: { enter: 'a', enterActive: 'zoom-in', exit: 'b', exitActive: 'zoom-out' },
        back: { enter: 'c', enterActive: 'zoom-in-back', exit: 'd', exitActive: 'zoom-out-back' },
      })
      const cn = classNamesFor('REPLACE', 'cover', 'zoom')
      expect(cn.enterActive).toBe('zoom-in')
    })

    it('REPLACE + modal 仍返回 NONE（modal 需要 PUSH/POP 方向语义）', () => {
      const cn = classNamesFor('REPLACE', 'cover', 'modal')
      expect(cn.enter).toBe('none-enter')
      expect(cn.enterActive).toBe('')
    })

    it('REPLACE + none 返回 NONE', () => {
      const cn = classNamesFor('REPLACE', 'cover', 'none')
      expect(cn.enter).toBe('none-enter')
    })
  })

  describe('tabs slide：tabIndex 缺失时优雅降级为 fade', () => {
    it('两端均无 tabIndex 时使用 FADE_FORWARD', () => {
      const { classNames } = planTransition(
        'REPLACE',
        snap('/tabs/settings'),       // 无 tabIndex
        snap('/tabs/profile'),         // 无 tabIndex
        'slide',
        { tabs: true },
      )
      expect(classNames.enterActive).toBe('fade-enter')
      expect(classNames.exitActive).toBe('fade-leave')
    })

    it('只有 from 有 tabIndex、to 没有时降级 fade', () => {
      const fromSnap = {
        path: '/tabs/a',
        key: 'k1',
        state: null,
        matches: [{ handle: { tabIndex: 0 } }],
      } as never
      const toSnap = snap('/tabs/b')   // 无 tabIndex

      const { classNames } = planTransition('REPLACE', fromSnap, toSnap, 'slide', { tabs: true })
      expect(classNames.enterActive).toBe('fade-enter')
    })

    it('两端均有 tabIndex 时仍用方向性 slide', () => {
      const tabSnap = (path: string, tabIndex: number) =>
        ({ path, key: path, state: null, matches: [{ handle: { tabIndex } }] }) as never
      const { classNames } = planTransition(
        'REPLACE',
        tabSnap('/tabs/a', 0),
        tabSnap('/tabs/b', 1),
        'slide',
        { tabs: true },
      )
      expect(classNames.enterActive).toBe('tabs-slide-enter-forward')
    })
  })

  describe('per-preset durationMs', () => {
    it('preset 未设置 durationMs 时使用全局默认值', () => {
      const { duration } = planTransition('PUSH', snap('/a'), snap('/b', 'b', { transition: 'fade' }), 'cover')
      expect(duration).toBe(300)
    })

    it('PUSH 时使用目标 preset 的 durationMs', () => {
      registerAnimPreset({
        type: 'slow-fade',
        forward: { enter: 'fr-animating fr-anim', enterActive: 'fade-enter', exit: 'fr-animating fr-anim', exitActive: 'fade-leave' },
        back: { enter: 'fr-animating fr-anim', enterActive: 'fade-enter', exit: 'fr-animating fr-anim', exitActive: 'fade-leave' },
        durationMs: 600,
      })
      const { duration } = planTransition(
        'PUSH',
        snap('/a'),
        snap('/b', 'b', { transition: 'slow-fade' }),
        'cover',
      )
      expect(duration).toBe(600)
    })

    it('POP 时使用 from（origin）preset 的 durationMs', () => {
      const { duration } = planTransition(
        'POP',
        snap('/b', 'b', { transition: 'slow-fade' }),
        snap('/a'),
        'cover',
      )
      expect(duration).toBe(600)
    })

    it('modal preset 注册表中 forward 指向 MODAL_PUSH（不再是 cover classNames）', () => {
      const modal = animPresetRegistry.get('modal')
      expect(modal?.forward.enter).toContain('fr-modal')
      expect(modal?.forward.enterActive).toBe('slide-up-enter')
    })
  })
})

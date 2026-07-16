import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(new URL('../anim.css', import.meta.url), 'utf8')

describe('anim.css 时长与缓动', () => {
  it('默认时长 300ms，可通过 --fr-duration 覆盖', () => {
    expect(CSS).toContain('--fr-duration: 300ms')
    expect(CSS).toContain('animation-duration: var(--fr-duration)')
  })

  it('页面转场用标准 ease-out（--fr-ease）', () => {
    expect(CSS).toContain('--fr-ease: cubic-bezier(0.25, 0.46, 0.45, 0.94)')
    const frAnim = CSS.match(/\.animated-outlet-page\.fr-anim\s*\{[^}]+\}/)?.[0] ?? ''
    expect(frAnim).toContain('var(--fr-ease)')
  })

  it('modal / modal-bg 用 spring 缓动（--fr-ease-spring）', () => {
    expect(CSS).toContain('--fr-ease-spring: cubic-bezier(0.32, 0.72, 0, 1)')
    const modalBlock = CSS.match(
      /\.animated-outlet-page\.fr-modal\.fr-anim,[\s\S]*?animation-timing-function: var\(--fr-ease-spring\)/,
    )?.[0]
    expect(modalBlock).toBeTruthy()
  })

  it('slide-next-enter 不单独覆盖缓动（与 cover 共用 fr-anim）', () => {
    // Only check within the .slide-next-enter rule block (not cross-file greedy match).
    expect(CSS).not.toMatch(/\.slide-next-enter\s*\{[^}]*animation-timing-function/)
  })

  it('tab slide 动画使用专属缓动 --fr-ease-tab', () => {
    expect(CSS).toContain('--fr-ease-tab: cubic-bezier(0.4, 0, 0.2, 1)')
    expect(CSS).toMatch(/tabs-slide-enter-forward[\s\S]*?animation-timing-function: var\(--fr-ease-tab\)/)
    expect(CSS).toMatch(/tabs-slide-enter-back[\s\S]*?animation-timing-function: var\(--fr-ease-tab\)/)
  })

  it('fr-tab-pre-enter-right/left 将页面定位在屏幕外侧（防止位置 0 闪烁）', () => {
    expect(CSS).toMatch(/\.animated-outlet-page\.fr-tab-pre-enter-right\s*\{[^}]*translate3d\(100%/)
    expect(CSS).toMatch(/\.animated-outlet-page\.fr-tab-pre-enter-left\s*\{[^}]*translate3d\(-100%/)
  })

  it('modal POP 退场壳层使用 --fr-modal-overlay', () => {
    expect(CSS).toContain('--fr-modal-overlay')
    expect(CSS).toContain('.fr-modal.fr-animating.slide-up-leave')
  })

  it('will-change 同时包含 transform 和 opacity（覆盖 fade/scale 动画）', () => {
    expect(CSS).toContain('will-change: transform, opacity')
  })

  it('显式 light class 可以覆盖系统暗色媒体查询', () => {
    expect(CSS).toContain('.light .animated-outlet-page')
    expect(CSS).toContain(':root:not(.light) .animated-outlet-page')
  })

  it('scale 和 modal-bg 动画使用 translate3d 触发 GPU 合成层', () => {
    expect(CSS).toMatch(/fr-scale-enter[\s\S]*?translate3d\(0, 0, 0\)/)
    expect(CSS).toMatch(/fr-scale-leave[\s\S]*?translate3d\(0, 0, 0\)/)
    expect(CSS).toMatch(/fr-modal-bg-leave[\s\S]*?translate3d\(0, 0, 0\)/)
  })

  it('modal-bg-enter 已移除（死代码）', () => {
    expect(CSS).not.toContain('modal-bg-enter')
    expect(CSS).not.toContain('fr-modal-bg-enter')
  })

  it('slide-prev-enter-slide class 与其 keyframes 相邻定义', () => {
    const classIdx = CSS.indexOf('.animated-outlet-page.slide-prev-enter-slide')
    const keyframeIdx = CSS.indexOf('@keyframes fr-slide-prev-enter-slide')
    // keyframe should be within 500 characters of the class declaration
    expect(keyframeIdx - classIdx).toBeLessThan(500)
    expect(keyframeIdx - classIdx).toBeGreaterThan(0)
  })
})

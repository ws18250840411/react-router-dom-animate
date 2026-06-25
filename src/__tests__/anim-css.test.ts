import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(resolve(__dirname, '../anim.css'), 'utf8')

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
    expect(CSS).not.toMatch(/\.slide-next-enter[\s\S]*animation-timing-function/)
  })

  it('modal POP 退场壳层使用 --fr-modal-overlay', () => {
    expect(CSS).toContain('--fr-modal-overlay')
    expect(CSS).toContain('.fr-modal.fr-animating.slide-up-leave')
  })
})

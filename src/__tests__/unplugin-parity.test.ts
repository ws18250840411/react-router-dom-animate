import { describe, expect, it } from 'vitest'

import { buildClassNames, getMode } from '../../../unplugin-react-router-dom/src/runtime/anim'
import { classNamesFor } from '../transition'
import type { ClassNames } from '../types'

function coreClassNames(cn: ClassNames) {
  return { enter: cn.enter, enterActive: cn.enterActive, exit: cn.exit, exitActive: cn.exitActive }
}

function unpluginClassNames(
  nav: 'PUSH' | 'POP' | 'REPLACE',
  from: string,
  to: string,
): ReturnType<typeof buildClassNames> {
  const mode = getMode(nav, to, from)
  const slideStyle =
    mode === 'slide-next'
      ? to === 'slide' || to === 'fade' || to === 'cover'
        ? to
        : 'cover'
      : mode === 'slide-prev'
        ? from === 'slide' || from === 'fade' || from === 'cover'
          ? from
          : 'cover'
        : 'cover'
  return buildClassNames(mode, slideStyle as 'cover' | 'slide' | 'fade')
}

describe('classNamesFor 与 unplugin getMode+buildClassNames 一致', () => {
  const matrix: { nav: 'PUSH' | 'POP' | 'REPLACE'; from: string; to: string }[] = [
    { nav: 'PUSH', from: 'cover', to: 'cover' },
    { nav: 'POP', from: 'cover', to: 'cover' },
    { nav: 'PUSH', from: 'cover', to: 'slide' },
    { nav: 'POP', from: 'slide', to: 'cover' },
    { nav: 'PUSH', from: 'fade', to: 'fade' },
    { nav: 'POP', from: 'fade', to: 'cover' },
    { nav: 'REPLACE', from: 'fade', to: 'fade' },
    { nav: 'PUSH', from: 'cover', to: 'modal' },
    { nav: 'POP', from: 'modal', to: 'cover' },
    { nav: 'PUSH', from: 'cover', to: 'none' },
    { nav: 'POP', from: 'none', to: 'cover' },
    // scale 为本库扩展预设，unplugin 无对应项
  ]

  for (const { nav, from, to } of matrix) {
    it(`${nav} ${from} → ${to}`, () => {
      if (nav === 'POP' && from === 'modal') {
        expect(coreClassNames(classNamesFor(nav, from, to))).toEqual({
          enter: 'fr-animating fr-anim fr-enter-below',
          enterActive: '',
          exit: 'fr-animating fr-anim fr-modal',
          exitActive: 'slide-up-leave',
        })
        return
      }
      if (nav === 'PUSH' && to === 'slide') {
        expect(coreClassNames(classNamesFor(nav, from, to))).toEqual({
          enter: 'fr-animating fr-anim',
          enterActive: 'slide-next-enter',
          exit: 'fr-animating fr-anim fr-enter-below',
          exitActive: 'slide-prev-leave-slide',
        })
        return
      }
      if (nav === 'POP' && from === 'slide') {
        expect(coreClassNames(classNamesFor(nav, from, to))).toEqual({
          enter: 'fr-animating fr-anim fr-enter-below',
          enterActive: 'slide-prev-enter-slide',
          exit: 'fr-animating fr-anim',
          exitActive: 'slide-next-leave',
        })
        return
      }
      expect(coreClassNames(classNamesFor(nav, from, to))).toEqual(coreClassNames(unpluginClassNames(nav, from, to)))
    })
  }
})

/**
 * @vitest-environment jsdom
 *
 * Tests for `<AnimatedOutlet keepAlive />` (stack / BackgroundPreserveRoot mode).
 * Covers rapid navigation, PUSH→POP state preservation, deep stacks, and animation
 * class presence.
 */
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import {
  NavLink,
  RouterProvider,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

import { AnimatedOutlet } from '../index'

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Helper: build a simple 3-level stack app (list → detail → deep)
// ---------------------------------------------------------------------------
function makeStackApp() {
  function ListPage() {
    const [count, setCount] = useState(0)
    return (
      <div>
        <span data-testid="counter">{count}</span>
        <button data-testid="inc" type="button" onClick={() => setCount((c) => c + 1)}>+</button>
        <NavLink data-testid="go-detail" to="/detail">detail</NavLink>
      </div>
    )
  }

  function DetailPage() {
    return (
      <div>
        <span data-testid="detail">Detail</span>
        <NavLink data-testid="go-deep" to="/deep">deep</NavLink>
        <NavLink data-testid="go-back" to="/" replace>back</NavLink>
      </div>
    )
  }

  function DeepPage() {
    return <div data-testid="deep">Deep</div>
  }

  function Layout() {
    return <AnimatedOutlet keepAlive transition="cover" />
  }

  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Layout />,
      children: [
        { index: true, element: <ListPage /> },
        { path: 'detail', element: <DetailPage /> },
        { path: 'deep', element: <DeepPage /> },
      ],
    },
  ]

  return createMemoryRouter(routes, { initialEntries: ['/'] })
}

// ---------------------------------------------------------------------------
// 1. PUSH→POP preserves state
// ---------------------------------------------------------------------------
describe('keepAlive stack：基础 PUSH→POP 状态保留', () => {
  it('PUSH detail 后 POP，list 的 useState 值保留', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    fireEvent.click(screen.getByTestId('inc'))
    fireEvent.click(screen.getByTestId('inc'))
    expect(screen.getByTestId('counter').textContent).toBe('2')

    await act(async () => { router.navigate('/detail') })
    await waitFor(() => screen.getByTestId('detail'))

    await act(async () => { router.navigate(-1) })
    await waitFor(() => screen.getByTestId('counter'))

    expect(screen.getByTestId('counter').textContent).toBe('2')
  })

  it('PUSH detail 时，cover enter 动画 class 出现', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    const group = document.querySelector('.animated-outlet-group')!
    const classHistory: string[] = []
    const obs = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          classHistory.push((m.target as Element).className)
        }
      })
    })
    obs.observe(group, { attributes: true, subtree: true })

    await act(async () => { router.navigate('/detail') })
    obs.disconnect()

    // Cover animation: entering page should have cover enter class
    expect(classHistory.some((c) => c.includes('fr-animating'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. Rapid navigation: PUSH→POP before animation completes
// ---------------------------------------------------------------------------
describe('keepAlive stack：快速 PUSH→POP（动画未完成）', () => {
  it('快速 PUSH detail → POP list，最终显示 list', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    // PUSH detail immediately then POP back
    await act(async () => { router.navigate('/detail') })
    await act(async () => { router.navigate(-1) })

    await waitFor(() => screen.getByTestId('counter'), { timeout: 1000 })
    expect(screen.getByTestId('counter')).toBeTruthy()

    // Wait for animations to clear
    await waitFor(
      () => expect(document.querySelectorAll('.fr-animating').length).toBe(0),
      { timeout: 1000 },
    )
  })

  it('快速 PUSH detail → PUSH deep → POP list，state 仍正确', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    fireEvent.click(screen.getByTestId('inc'))
    expect(screen.getByTestId('counter').textContent).toBe('1')

    // Rapid PUSH→PUSH
    await act(async () => { router.navigate('/detail') })
    await act(async () => { router.navigate('/deep') })

    await waitFor(() => screen.getByTestId('deep'), { timeout: 1000 })

    // POP back to root (2 levels)
    await act(async () => { router.navigate(-2) })

    await waitFor(() => screen.getByTestId('counter'), { timeout: 1000 })
    expect(screen.getByTestId('counter').textContent).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// 3. Deep stack: 3+ levels, non-top/second entries should not flash
// ---------------------------------------------------------------------------
describe('keepAlive stack：深栈（3 层）', () => {
  it('PUSH 到深层页后，根页（/）在 DOM 中保持 keepAlive', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    // / → /detail
    await act(async () => { router.navigate('/detail') })
    await waitFor(() => screen.getByTestId('detail'), { timeout: 500 })

    // /detail → /deep (same depth level in this test app, treated as same-level update)
    await act(async () => { router.navigate('/deep') })
    await waitFor(() => screen.getByTestId('deep'), { timeout: 500 })

    // The group should have keepAlive containers in the DOM (list page preserved)
    const pages = document.querySelectorAll('.animated-outlet-page')
    expect(pages.length).toBeGreaterThanOrEqual(1)

    // The counter (list page) should still be in the DOM (keepAlive)
    const counterEl = document.querySelector('[data-testid="counter"]')
    expect(counterEl).toBeTruthy()
  })

  it('从第 3 层 POP 到根，动画后无残留 fr-animating class', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    await act(async () => { router.navigate('/detail') })
    await waitFor(() => screen.getByTestId('detail'), { timeout: 500 })
    await act(async () => { router.navigate('/deep') })
    await waitFor(() => screen.getByTestId('deep'), { timeout: 500 })

    // POP 2 levels back to root
    await act(async () => { router.navigate(-2) })

    await waitFor(
      () => expect(document.querySelectorAll('.fr-animating').length).toBe(0),
      { timeout: 1500 },
    )

    await waitFor(() => screen.getByTestId('counter'), { timeout: 500 })
  })
})

// ---------------------------------------------------------------------------
// 4. REPLACE with different stableKey: enter animation fires
// ---------------------------------------------------------------------------
describe('keepAlive stack：REPLACE 到不同页面（Bug #4 回归）', () => {
  it('REPLACE 导航到不同 stableKey 页面时有进入动画（fr-animating 出现）', async () => {
    // Build a route with REPLACE navigation between detail siblings
    function LayoutWithReplace() {
      return (
        <>
          <NavLink data-testid="go-detail" to="/detail" replace>detail</NavLink>
          <NavLink data-testid="go-other" to="/other" replace>other</NavLink>
          <AnimatedOutlet keepAlive transition="cover" />
        </>
      )
    }

    const routes: RouteObject[] = [
      {
        path: '/',
        element: <LayoutWithReplace />,
        children: [
          { index: true, element: <div data-testid="home">Home</div> },
          { path: 'detail', element: <div data-testid="detail-r">Detail</div> },
          { path: 'other', element: <div data-testid="other-r">Other</div> },
        ],
      },
    ]

    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('home'))

    // Navigate to detail (PUSH)
    await act(async () => { router.navigate('/detail') })
    await waitFor(() => screen.getByTestId('detail-r'), { timeout: 500 })

    const group = document.querySelector('.animated-outlet-group')!
    const classHistory: string[] = []
    const obs = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          classHistory.push((m.target as Element).className)
        }
      })
    })
    obs.observe(group, { attributes: true, subtree: true })

    // REPLACE to other (different stableKey sibling)
    await act(async () => { router.navigate('/other', { replace: true }) })
    obs.disconnect()

    // With our fix, the REPLACE should also have enter animation
    const hasAnim = classHistory.some((c) => c.includes('fr-animating'))
    expect(hasAnim).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. fromSnapRef rapid navigation: A→B direction always correct
// ---------------------------------------------------------------------------
describe('keepAlive stack：fromSnapRef 快速导航方向正确（Bug #1 回归）', () => {
  it('PUSH detail 正向动画正常（cover enter）', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    const group = document.querySelector('.animated-outlet-group')!
    const classHistory: string[] = []
    const obs = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          classHistory.push((m.target as Element).className)
        }
      })
    })
    obs.observe(group, { attributes: true, subtree: true })
    await act(async () => { router.navigate('/detail') })
    obs.disconnect()

    // There should be animation (fr-animating class appeared on some element)
    expect(classHistory.some((c) => c.includes('fr-animating'))).toBe(true)
  })

  it('快速 list→detail→list→detail：每次都有动画', async () => {
    const router = makeStackApp()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))

    for (let i = 0; i < 3; i++) {
      const group = document.querySelector('.animated-outlet-group')!
      const classHistory: string[] = []
      const obs = new MutationObserver((muts) => {
        muts.forEach((m) => {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            classHistory.push((m.target as Element).className)
          }
        })
      })
      obs.observe(group, { attributes: true, subtree: true })

      if (i % 2 === 0) {
        await act(async () => { router.navigate('/detail') })
      } else {
        await act(async () => { router.navigate(-1) })
      }
      obs.disconnect()

      expect(classHistory.some((c) => c.includes('fr-animating'))).toBe(true)

      // Wait for animation to complete before next iteration
      await waitFor(
        () => expect(document.querySelectorAll('.fr-animating').length).toBe(0),
        { timeout: 800 },
      )
    }
  })
})

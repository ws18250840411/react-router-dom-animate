/**
 * @vitest-environment jsdom
 *
 * Tests for:
 *   - `aliveRef` imperative cache control API (remove / removeAll / getCached)
 *   - `max` LRU eviction in keepAlive switch mode
 *   - `setAnimDuration` JS override for animation duration
 *   - Regression: aliveRef.remove() called during exit animation must not leave
 *     a stale activityModesRef entry.
 */
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef, useEffect, useState } from 'react'
import {
  NavLink,
  RouterProvider,
  createMemoryRouter,
  useNavigate,
  type RouteObject,
} from 'react-router-dom'

import { AnimatedOutlet, KeepAlive, setAnimDuration } from '../index'
import { registerAnimPreset, planTransition } from '../transition'
import type { KeepAliveRef } from '../types'
import type { RouteSnapshot } from '../types'

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSwitch(opts: {
  aliveRef?: React.RefObject<KeepAliveRef | null | undefined>
  max?: number
  include?: string[]
  exclude?: string[]
} = {}) {
  function Page({ name }: { name: string }) {
    return <div data-testid={`page-${name}`}>{name}</div>
  }

  function Layout() {
    const navigate = useNavigate()
    return (
      <>
        <button type="button" data-testid="go-a" onClick={() => navigate('/sw/a', { replace: true })}>A</button>
        <button type="button" data-testid="go-b" onClick={() => navigate('/sw/b', { replace: true })}>B</button>
        <button type="button" data-testid="go-c" onClick={() => navigate('/sw/c', { replace: true })}>C</button>
        <button type="button" data-testid="go-d" onClick={() => navigate('/sw/d', { replace: true })}>D</button>
        <KeepAlive
          mode="switch"
          aliveRef={opts.aliveRef}
          max={opts.max}
          include={opts.include}
          exclude={opts.exclude}
        >
          <AnimatedOutlet />
        </KeepAlive>
      </>
    )
  }

  const routes: RouteObject[] = [
    {
      element: <Layout />,
      children: [
        { path: '/sw/a', element: <Page name="a" /> },
        { path: '/sw/b', element: <Page name="b" /> },
        { path: '/sw/c', element: <Page name="c" /> },
        { path: '/sw/d', element: <Page name="d" /> },
      ],
    },
  ]

  return createMemoryRouter(routes, { initialEntries: ['/sw/a'] })
}

function snap(path: string, key = path, state: unknown = null): RouteSnapshot {
  return { path, key, state, matches: [] }
}

// ---------------------------------------------------------------------------
// 1. aliveRef.getCached()
// ---------------------------------------------------------------------------
describe('aliveRef.getCached()', () => {
  it('初始只有当前激活页', async () => {
    const ref = createRef<KeepAliveRef | undefined>()
    const router = makeSwitch({ aliveRef: ref })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    expect(ref.current?.getCached()).toEqual(['/sw/a'])
  })

  it('访问多个页面后，列出所有已缓存路径（LRU 顺序，尾部最新）', async () => {
    const ref = createRef<KeepAliveRef | undefined>()
    const router = makeSwitch({ aliveRef: ref })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    fireEvent.click(screen.getByTestId('go-c'))
    await waitFor(() => screen.getByTestId('page-c'))

    const cached = ref.current!.getCached()
    expect(cached).toContain('/sw/a')
    expect(cached).toContain('/sw/b')
    expect(cached).toContain('/sw/c')
    expect(cached[cached.length - 1]).toBe('/sw/c')
  })
})

// ---------------------------------------------------------------------------
// 2. aliveRef.remove()
// ---------------------------------------------------------------------------
describe('aliveRef.remove(pathname)', () => {
  it('移除非激活页：下次访问重新 mount（state 重置）', async () => {
    let mountCount = 0

    function CountPage({ name }: { name: string }) {
      useEffect(() => { mountCount++ }, [])
      const [count, setCount] = useState(0)
      return (
        <div>
          <span data-testid={`counter-${name}`}>{count}</span>
          <button type="button" data-testid={`inc-${name}`} onClick={() => setCount((c) => c + 1)}>+</button>
        </div>
      )
    }

    const ref = createRef<KeepAliveRef | undefined>()

    function Layout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-a" onClick={() => navigate('/rm/a', { replace: true })}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/rm/b', { replace: true })}>B</button>
          <button type="button" data-testid="clear-a" onClick={() => ref.current?.remove('/rm/a')}>
            clear A
          </button>
          <KeepAlive mode="switch" aliveRef={ref}><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const routes: RouteObject[] = [
      {
        element: <Layout />,
        children: [
          { path: '/rm/a', element: <CountPage name="a" /> },
          { path: '/rm/b', element: <CountPage name="b" /> },
        ],
      },
    ]

    const router = createMemoryRouter(routes, { initialEntries: ['/rm/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter-a'))
    expect(mountCount).toBe(1)

    // 在 A 上递增计数
    fireEvent.click(screen.getByTestId('inc-a'))
    fireEvent.click(screen.getByTestId('inc-a'))
    expect(screen.getByTestId('counter-a').textContent).toBe('2')

    // 切到 B
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('counter-b'))

    // 清除 A 的缓存
    fireEvent.click(screen.getByTestId('clear-a'))
    expect(ref.current?.getCached()).not.toContain('/rm/a')

    // 切回 A：应该重新 mount，state 重置为 0
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => screen.getByTestId('counter-a'))
    expect(screen.getByTestId('counter-a').textContent).toBe('0')
    expect(mountCount).toBe(3) // mount × 2 (初始 + 重新 mount) — React StrictMode 无影响
  })

  it('remove() 对激活页无效', async () => {
    const ref = createRef<KeepAliveRef | undefined>()

    function Layout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-b" onClick={() => navigate('/rm2/b', { replace: true })}>B</button>
          <button type="button" data-testid="remove-a" onClick={() => ref.current?.remove('/rm2/a')}>
            remove A
          </button>
          <KeepAlive mode="switch" aliveRef={ref}><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const routes: RouteObject[] = [
      {
        element: <Layout />,
        children: [
          { path: '/rm2/a', element: <div data-testid="page-a">A</div> },
          { path: '/rm2/b', element: <div data-testid="page-b">B</div> },
        ],
      },
    ]

    const router = createMemoryRouter(routes, { initialEntries: ['/rm2/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // 试图移除当前激活页：应无效
    fireEvent.click(screen.getByTestId('remove-a'))
    expect(ref.current?.getCached()).toContain('/rm2/a')
    expect(document.querySelector('[data-testid="page-a"]')).toBeTruthy()
  })

  it('remove() 后 getCached() 不再包含该路径', async () => {
    const ref = createRef<KeepAliveRef | undefined>()
    const router = makeSwitch({ aliveRef: ref })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    expect(ref.current?.getCached()).toContain('/sw/a')

    ref.current?.remove('/sw/a')
    expect(ref.current?.getCached()).not.toContain('/sw/a')
    // 移除后 A 不应再出现在 DOM
    await waitFor(() => {
      expect(document.querySelector('[data-testid="page-a"]')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// 3. aliveRef.removeAll()
// ---------------------------------------------------------------------------
describe('aliveRef.removeAll()', () => {
  it('清除所有非激活页，当前页保留', async () => {
    const ref = createRef<KeepAliveRef | undefined>()
    const router = makeSwitch({ aliveRef: ref })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    fireEvent.click(screen.getByTestId('go-c'))
    await waitFor(() => screen.getByTestId('page-c'))

    // 当前在 C，移除所有
    ref.current?.removeAll()

    // getCached() 只剩当前激活页 /sw/c
    expect(ref.current?.getCached()).toEqual(['/sw/c'])

    // A/B 的 DOM 节点应消失
    await waitFor(() => {
      expect(document.querySelector('[data-testid="page-a"]')).toBeNull()
      expect(document.querySelector('[data-testid="page-b"]')).toBeNull()
    })
    // C 当前激活，仍在 DOM
    expect(document.querySelector('[data-testid="page-c"]')).toBeTruthy()
  })

  it('removeAll() 后切换到曾被清除的页面，状态重置', async () => {
    let mountCount = 0

    function StatePage({ name }: { name: string }) {
      useEffect(() => { mountCount++ }, [])
      const [n, setN] = useState(0)
      return (
        <div>
          <span data-testid={`val-${name}`}>{n}</span>
          <button type="button" data-testid={`add-${name}`} onClick={() => setN((c) => c + 1)}>+</button>
        </div>
      )
    }

    const ref = createRef<KeepAliveRef | undefined>()

    function Layout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-a" onClick={() => navigate('/rma/a', { replace: true })}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/rma/b', { replace: true })}>B</button>
          <button type="button" data-testid="removeAll" onClick={() => ref.current?.removeAll()}>clear</button>
          <KeepAlive mode="switch" aliveRef={ref}><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const routes: RouteObject[] = [
      {
        element: <Layout />,
        children: [
          { path: '/rma/a', element: <StatePage name="a" /> },
          { path: '/rma/b', element: <StatePage name="b" /> },
        ],
      },
    ]

    const router = createMemoryRouter(routes, { initialEntries: ['/rma/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('val-a'))

    // A 上加计数
    fireEvent.click(screen.getByTestId('add-a'))
    expect(screen.getByTestId('val-a').textContent).toBe('1')

    // 切到 B
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('val-b'))

    // 在 B 上清除所有（A 会被清除）
    fireEvent.click(screen.getByTestId('removeAll'))
    expect(ref.current?.getCached()).toEqual(['/rma/b'])

    // 切回 A：重新 mount，state 重置
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => screen.getByTestId('val-a'))
    expect(screen.getByTestId('val-a').textContent).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// 4. max LRU eviction
// ---------------------------------------------------------------------------
describe('max LRU 淘汰', () => {
  it('超过 max 时，最旧的缓存页被淘汰', async () => {
    const ref = createRef<KeepAliveRef | undefined>()
    // max=2：同时最多缓存 2 个页面
    const router = makeSwitch({ aliveRef: ref, max: 2 })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // 访问 A（当前），然后访问 B
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    // 此时缓存：[A, B]（共 2 个，未超出）
    expect(ref.current?.getCached().length).toBe(2)

    // 访问 C → 缓存超出 max=2，A（最旧）应被淘汰
    fireEvent.click(screen.getByTestId('go-c'))
    await waitFor(() => screen.getByTestId('page-c'))

    const cached = ref.current!.getCached()
    expect(cached.length).toBe(2)
    expect(cached).not.toContain('/sw/a') // A 被淘汰
    expect(cached).toContain('/sw/b')
    expect(cached).toContain('/sw/c')

    // A 的 DOM 节点应消失
    await waitFor(() => {
      expect(document.querySelector('[data-testid="page-a"]')).toBeNull()
    })
  })

  it('max LRU：访问已缓存页使其成为"最新"，不被淘汰', async () => {
    const ref = createRef<KeepAliveRef | undefined>()
    const router = makeSwitch({ aliveRef: ref, max: 2 })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // A → B → A（A 重新变为最新）→ C（B 应被淘汰，A 保留）
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => screen.getByTestId('page-a'))

    fireEvent.click(screen.getByTestId('go-c'))
    await waitFor(() => screen.getByTestId('page-c'))

    const cached = ref.current!.getCached()
    expect(cached).not.toContain('/sw/b') // B 是最旧的，被淘汰
    expect(cached).toContain('/sw/a')     // A 是较新的，保留
    expect(cached).toContain('/sw/c')     // C 是当前页
  })

  it('被淘汰的页面再次访问时重新 mount（state 重置）', async () => {
    let mountCount = 0

    function CountPage({ label }: { label: string }) {
      useEffect(() => { mountCount++ }, [])
      const [n, setN] = useState(0)
      return (
        <div>
          <span data-testid={`n-${label}`}>{n}</span>
          <button type="button" data-testid={`inc-${label}`} onClick={() => setN((c) => c + 1)}>+</button>
        </div>
      )
    }

    function Layout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-a" onClick={() => navigate('/lru/a', { replace: true })}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/lru/b', { replace: true })}>B</button>
          <button type="button" data-testid="go-c" onClick={() => navigate('/lru/c', { replace: true })}>C</button>
          <KeepAlive mode="switch" max={2}><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const routes: RouteObject[] = [
      {
        element: <Layout />,
        children: [
          { path: '/lru/a', element: <CountPage label="a" /> },
          { path: '/lru/b', element: <CountPage label="b" /> },
          { path: '/lru/c', element: <CountPage label="c" /> },
        ],
      },
    ]

    const router = createMemoryRouter(routes, { initialEntries: ['/lru/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('n-a'))

    // 累加 A 的计数
    fireEvent.click(screen.getByTestId('inc-a'))
    fireEvent.click(screen.getByTestId('inc-a'))
    expect(screen.getByTestId('n-a').textContent).toBe('2')

    // A → B → C：A 被淘汰（max=2，缓存 = [B, C]）
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('n-b'))

    fireEvent.click(screen.getByTestId('go-c'))
    await waitFor(() => screen.getByTestId('n-c'))

    // 切回 A：A 已被淘汰，重新 mount，state 重置为 0
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => screen.getByTestId('n-a'))
    expect(screen.getByTestId('n-a').textContent).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// 5. setAnimDuration — JS 覆盖动画时长
// ---------------------------------------------------------------------------
describe('setAnimDuration', () => {
  beforeEach(() => {
    // 注册一个专用测试 preset，避免修改内置 preset 污染其他测试
    registerAnimPreset({
      type: 'test-duration',
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
      durationMs: 200,
    })
  })

  it('初始 durationMs 来自 registerAnimPreset 时的值', () => {
    const { duration } = planTransition(
      'PUSH',
      snap('/a'),
      snap('/b', 'b', { transition: 'test-duration' }),
      'cover',
    )
    expect(duration).toBe(200)
  })

  it('setAnimDuration 覆盖 preset 的 durationMs', () => {
    setAnimDuration('test-duration', 999)
    const { duration } = planTransition(
      'PUSH',
      snap('/a'),
      snap('/b', 'b', { transition: 'test-duration' }),
      'cover',
    )
    expect(duration).toBe(999)
  })

  it('setAnimDuration POP 方向同样使用新时长', () => {
    setAnimDuration('test-duration', 750)
    const { duration } = planTransition(
      'POP',
      snap('/b', 'b', { transition: 'test-duration' }),
      snap('/a'),
      'cover',
    )
    expect(duration).toBe(750)
  })

  it('setAnimDuration 对不存在的 type 只更新缓存（不崩溃）', () => {
    // 对未注册的 type 调用 setAnimDuration 只更新 typedDurationCache，不崩溃
    expect(() => setAnimDuration('non-existent-type-xyz', 123)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 6. Regression: aliveRef.remove() during exit animation → no stale activityMode
// ---------------------------------------------------------------------------
describe('Bug 回归：aliveRef.remove() 在退出动画期间调用不留孤立 activityMode', () => {
  it('remove() 在动画期间调用后，目标页最终从 DOM 移除（无孤立条目）', async () => {
    const ref = createRef<KeepAliveRef | undefined>()

    function Layout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-a" onClick={() => navigate('/rmani/a', { replace: true })}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/rmani/b', { replace: true })}>B</button>
          {/* 动画中途立即 remove A */}
          <button
            type="button"
            data-testid="go-b-and-remove-a"
            onClick={() => {
              navigate('/rmani/b', { replace: true })
              // remove 在 navigate 之后同步调用，模拟动画期间调用
              setTimeout(() => ref.current?.remove('/rmani/a'), 10)
            }}
          >
            go-b-remove-a
          </button>
          <KeepAlive mode="switch" aliveRef={ref}><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const routes: RouteObject[] = [
      {
        element: <Layout />,
        children: [
          { path: '/rmani/a', element: <div data-testid="page-a">A</div> },
          { path: '/rmani/b', element: <div data-testid="page-b">B</div> },
        ],
      },
    ]

    const router = createMemoryRouter(routes, { initialEntries: ['/rmani/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // 切换到 B 并在动画期间移除 A
    await act(async () => {
      fireEvent.click(screen.getByTestId('go-b-and-remove-a'))
    })

    await waitFor(() => screen.getByTestId('page-b'))

    // 等待动画和超时（300ms + 50ms grace）
    await waitFor(
      () => {
        // A 应从 DOM 移除（被 remove() 清除）
        expect(document.querySelector('[data-testid="page-a"]')).toBeNull()
      },
      { timeout: 1000 },
    )

    // getCached() 不应包含 /rmani/a（无孤立条目）
    expect(ref.current?.getCached()).not.toContain('/rmani/a')
    expect(ref.current?.getCached()).toContain('/rmani/b')
  })
})

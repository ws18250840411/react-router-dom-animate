/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, useState } from 'react'
import {
  RouterProvider,
  createMemoryRouter,
  useParams,
  type RouteObject,
} from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { AnimatedOutlet, KeepAlive, type KeepAliveRef } from '../index'

afterEach(() => cleanup())

describe('KeepAlive 专项压力测试', () => {
  it('动态参数路由按 pathname 隔离实例，并按名称匹配 include 和执行 LRU', async () => {
    const aliveRef = createRef<KeepAliveRef | undefined>()
    const mounts = new Map<string, number>()

    function DynamicPage() {
      const id = useParams().id!
      const [count, setCount] = useState(0)
      useState(() => mounts.set(id, (mounts.get(id) ?? 0) + 1))
      return (
        <div data-testid={`page-${id}`}>
          <span data-testid={`count-${id}`}>{count}</span>
          <button type="button" data-testid={`increment-${id}`} onClick={() => setCount((value) => value + 1)}>+</button>
        </div>
      )
    }

    function Layout() {
      return (
        <KeepAlive mode="switch" include={['DynamicPage']} max={3} aliveRef={aliveRef}>
          <AnimatedOutlet />
        </KeepAlive>
      )
    }

    const router = createMemoryRouter([
      {
        element: <Layout />,
        children: [
          {
            path: '/items/:id',
            element: <DynamicPage />,
            handle: { keepAliveName: 'DynamicPage' },
          },
        ],
      },
    ], { initialEntries: ['/items/1'] })

    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-1'))
    fireEvent.click(screen.getByTestId('increment-1'))

    for (let id = 2; id <= 40; id++) {
      await act(async () => { await router.navigate(`/items/${id}`, { replace: true }) })
    }
    await act(async () => { await router.navigate('/items/1', { replace: true }) })

    expect(aliveRef.current?.getCached()).toEqual(['/items/39', '/items/40', '/items/1'])
    expect(screen.getByTestId('count-1').textContent).toBe('0')
    expect(mounts.get('1')).toBe(2)

    fireEvent.click(screen.getByTestId('increment-1'))
    await act(async () => { await router.navigate('/items/2', { replace: true }) })
    await act(async () => { await router.navigate('/items/1', { replace: true }) })
    expect(screen.getByTestId('count-1').textContent).toBe('1')
    expect(mounts.get('1')).toBe(2)
  })

  it('根 stack 与内层 switch 嵌套时，详情返回保留 Tab 状态且缓存池不膨胀', async () => {
    const tabsRef = createRef<KeepAliveRef | undefined>()

    function StatefulTab({ name }: { name: string }) {
      const [count, setCount] = useState(0)
      return (
        <div data-testid={`tab-${name}`}>
          <span data-testid={`tab-count-${name}`}>{count}</span>
          <button type="button" data-testid={`tab-increment-${name}`} onClick={() => setCount((value) => value + 1)}>+</button>
        </div>
      )
    }

    function RootLayout() {
      return <KeepAlive><AnimatedOutlet transition="none" /></KeepAlive>
    }

    function TabsLayout() {
      return (
        <KeepAlive mode="switch" max={2} aliveRef={tabsRef}>
          <AnimatedOutlet />
        </KeepAlive>
      )
    }

    const routes: RouteObject[] = [
      {
        element: <RootLayout />,
        children: [
          {
            path: 'tabs',
            element: <TabsLayout />,
            children: [
              { path: 'a', element: <StatefulTab name="a" /> },
              { path: 'b', element: <StatefulTab name="b" /> },
            ],
          },
          { path: 'detail', element: <div data-testid="detail">detail</div> },
        ],
      },
    ]
    const router = createMemoryRouter(routes, { initialEntries: ['/tabs/a'] })

    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('tab-a'))
    fireEvent.click(screen.getByTestId('tab-increment-a'))
    await act(async () => { await router.navigate('/tabs/b', { replace: true }) })
    await act(async () => { await router.navigate('/detail') })
    await act(async () => { await router.navigate(-1) })
    await act(async () => { await router.navigate('/tabs/a', { replace: true }) })

    expect(screen.getByTestId('tab-count-a').textContent).toBe('1')
    expect(tabsRef.current?.getCached()).toEqual(['/tabs/b', '/tabs/a'])
    expect(document.querySelectorAll('.animated-outlet-page').length).toBeLessThanOrEqual(3)
  })

  it('多个 Router 的缓存池和命令式 API 完全隔离', async () => {
    const firstRef = createRef<KeepAliveRef | undefined>()
    const secondRef = createRef<KeepAliveRef | undefined>()

    function PoolLayout({ aliveRef }: { aliveRef: typeof firstRef }) {
      return <KeepAlive mode="switch" max={2} aliveRef={aliveRef}><AnimatedOutlet /></KeepAlive>
    }

    const makeRoutes = (prefix: string, aliveRef: typeof firstRef): RouteObject[] => [{
      element: <PoolLayout aliveRef={aliveRef} />,
      children: [
        { path: `/${prefix}/a`, element: <div data-testid={`${prefix}-a`}>a</div> },
        { path: `/${prefix}/b`, element: <div data-testid={`${prefix}-b`}>b</div> },
      ],
    }]

    const firstRouter = createMemoryRouter(makeRoutes('first', firstRef), { initialEntries: ['/first/a'] })
    const secondRouter = createMemoryRouter(makeRoutes('second', secondRef), { initialEntries: ['/second/a'] })

    render(<>
      <RouterProvider router={firstRouter} />
      <RouterProvider router={secondRouter} />
    </>)
    await waitFor(() => screen.getByTestId('first-a'))
    await waitFor(() => screen.getByTestId('second-a'))

    await act(async () => { await firstRouter.navigate('/first/b', { replace: true }) })
    await act(async () => { await secondRouter.navigate('/second/b', { replace: true }) })
    firstRef.current?.removeAll()

    expect(firstRef.current?.getCached()).toEqual(['/first/b'])
    expect(secondRef.current?.getCached()).toEqual(['/second/a', '/second/b'])
    expect(document.querySelector('[data-testid="second-a"]')).not.toBeNull()
  })

  it('max 小于 1 时至少保留当前活动页面', async () => {
    function Layout() {
      return <KeepAlive mode="switch" max={0}><AnimatedOutlet /></KeepAlive>
    }
    const router = createMemoryRouter([{
      element: <Layout />,
      children: [{ path: '/only', element: <div data-testid="only">only</div> }],
    }], { initialEntries: ['/only'] })

    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('only'))
    expect(screen.getByTestId('only')).toBeTruthy()
  })

  it('全局正则过滤器不会向调用方泄漏 lastIndex 状态', async () => {
    const include = /CachedPage/g
    function Layout() {
      return <KeepAlive mode="switch" include={include}><AnimatedOutlet /></KeepAlive>
    }
    const router = createMemoryRouter([{
      element: <Layout />,
      children: [
        { path: '/regex/a', handle: { keepAliveName: 'CachedPage' }, element: <div data-testid="regex-a">a</div> },
        { path: '/regex/b', handle: { keepAliveName: 'CachedPage' }, element: <div data-testid="regex-b">b</div> },
      ],
    }], { initialEntries: ['/regex/a'] })

    render(<RouterProvider router={router} />)
    await screen.findByTestId('regex-a')
    await act(async () => { await router.navigate('/regex/b', { replace: true }) })
    expect(include.lastIndex).toBe(0)
  })

  it('浏览器隐藏页面时产生的 scrollTop 归零事件不会覆盖返回快照', async () => {
    function ScrollPage() {
      return <div data-testid="scroll-box" style={{ height: 100, overflow: 'auto' }}><div style={{ height: 1000 }} /></div>
    }
    function Layout() {
      return <KeepAlive><AnimatedOutlet transition="none" /></KeepAlive>
    }
    const router = createMemoryRouter([{
      element: <Layout />,
      children: [
        { path: '/list', element: <ScrollPage /> },
        { path: '/detail', element: <div data-testid="scroll-detail">detail</div> },
      ],
    }], { initialEntries: ['/list'] })

    render(<RouterProvider router={router} />)
    const scrollBox = await screen.findByTestId('scroll-box')
    scrollBox.scrollTop = 321
    fireEvent.scroll(scrollBox)

    await act(async () => { await router.navigate('/detail') })
    scrollBox.scrollTop = 0
    fireEvent.scroll(scrollBox)
    await act(async () => { await router.navigate(-1) })

    expect(scrollBox.scrollTop).toBe(321)
  })
})

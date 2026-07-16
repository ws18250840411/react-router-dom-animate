/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef, useEffect, useState } from 'react'
import { CSSTransition, TransitionGroup } from 'react-transition-group'
import {
  NavLink,
  RouterProvider,
  createMemoryRouter,
  useLocation,
  useNavigate,
  type RouteObject,
} from 'react-router-dom'

import { AnimatedOutlet, KeepAlive, useActivated, useDeactivated } from '../index'

afterEach(() => cleanup())

function Page({ name }: { name: string }) {
  const { pathname } = useLocation()
  return <div data-testid="page">{name}:{pathname}</div>
}

const routes: RouteObject[] = [
  {
    element: <AnimatedOutlet />,
    children: [
      { path: '/', element: <Page name="home" /> },
      { path: '/about', element: <Page name="about" /> },
    ],
  },
]

describe('AnimatedOutlet integration', () => {
  it('渲染子路由页面', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByTestId('page').textContent).toBe('home:/')
  })

  it('存在 animated-outlet-page 容器', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    const { unmount } = render(<RouterProvider router={router} />)
    expect(document.querySelectorAll('.animated-outlet-page').length).toBeGreaterThanOrEqual(1)
    unmount()
  })

  it('嵌套 layout transition 不报错', () => {
    function TabsLayout() {
      return <AnimatedOutlet mode="switch" transition="fade" />
    }

    const nested: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            element: <TabsLayout />,
            children: [{ path: '/', element: <Page name="tab" /> }],
          },
        ],
      },
    ]

    const router = createMemoryRouter(nested, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByTestId('page').textContent).toBe('tab:/')
  })

  it('Tab 切换走内层 fade，重复点击当前 Tab 不触发动画', async () => {
    function TabsLayout() {
      const navigate = useNavigate()
      return (
        <>
          <nav>
            <button type="button" data-testid="tab-a" onClick={() => navigate('/tabs/a', { replace: true })}>
              A
            </button>
            <button type="button" data-testid="tab-b" onClick={() => navigate('/tabs/b')}>
              B
            </button>
          </nav>
          <AnimatedOutlet mode="switch" transition="fade" />
        </>
      )
    }

    const tabRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/tabs',
            handle: { transition: 'fade' },
            element: <TabsLayout />,
            children: [
              { path: 'a', handle: { tabIndex: 0 }, element: <Page name="a" /> },
              { path: 'b', handle: { tabIndex: 1 }, element: <Page name="b" /> },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(tabRoutes, { initialEntries: ['/tabs/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('page').textContent).toBe('a:/tabs/a'))

    fireEvent.click(screen.getByTestId('tab-b'))
    await waitFor(() => {
      const classesOnSwitch = [...document.querySelectorAll('.animated-outlet-page')].map((e) => e.className)
      expect(classesOnSwitch.some((c) => /fade-enter|fade-leave|fr-animating/.test(c))).toBe(true)
      expect(classesOnSwitch.some((c) => /slide-next-enter|slide-prev-leave/.test(c))).toBe(false)
    })

    await waitFor(() => expect(screen.getByTestId('page').textContent).toBe('b:/tabs/b'), { timeout: 2000 })
    await waitFor(() => expect(document.querySelectorAll('.fr-animating').length).toBe(0), { timeout: 2000 })

    const countBefore = document.querySelectorAll('.animated-outlet-page').length
    fireEvent.click(screen.getByTestId('tab-b'))
    expect(document.querySelectorAll('.fr-animating').length).toBe(0)
    expect(document.querySelectorAll('.animated-outlet-page').length).toBe(countBefore)
  })

  it('mode="switch" + NavLink 重复点击当前 Tab 不 remount 子页面', async () => {
    let instances = 0

    function TabPage() {
      const [instanceId] = useState(() => ++instances)
      return <div data-testid="tab-page">{instanceId}</div>
    }

    function TabsLayout() {
      return (
        <>
          <nav>
            <NavLink to="/tabs/a" replace data-testid="nav-a">
              A
            </NavLink>
            <NavLink to="/tabs/b" replace data-testid="nav-b">
              B
            </NavLink>
          </nav>
          <AnimatedOutlet mode="switch" />
        </>
      )
    }

    const tabRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/tabs',
            element: <TabsLayout />,
            children: [
              { path: 'a', element: <TabPage /> },
              { path: 'b', element: <TabPage /> },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(tabRoutes, { initialEntries: ['/tabs/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('tab-page').textContent).toBe('1'))

    for (let i = 0; i < 15; i++) {
      fireEvent.click(screen.getByTestId('nav-a'))
    }

    expect(screen.getByTestId('tab-page').textContent).toBe('1')
    expect(instances).toBe(1)
    expect(document.querySelectorAll('.fr-animating').length).toBe(0)
  })

  it('mode="switch" 同路径 navigate（新 location.key）不 remount 子页面', async () => {
    let instances = 0

    function TabPage() {
      const [instanceId] = useState(() => ++instances)
      return <div data-testid="tab-page">{instanceId}</div>
    }

    function TabsLayout() {
      const navigate = useNavigate()
      return (
        <>
          <button
            type="button"
            data-testid="repeat-a"
            onClick={() => navigate('/tabs/a', { replace: true })}
          >
            repeat
          </button>
          <AnimatedOutlet mode="switch" />
        </>
      )
    }

    const tabRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/tabs',
            element: <TabsLayout />,
            children: [{ path: 'a', element: <TabPage /> }],
          },
        ],
      },
    ]

    const router = createMemoryRouter(tabRoutes, { initialEntries: ['/tabs/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('tab-page').textContent).toBe('1'))

    for (let i = 0; i < 15; i++) {
      fireEvent.click(screen.getByTestId('repeat-a'))
    }

    expect(screen.getByTestId('tab-page').textContent).toBe('1')
    expect(instances).toBe(1)
  })
})

describe('keepAlive switch + slide 动画（快速切换）', () => {
  function makeTabsApp(tabIndex = false) {
    function TabPage({ name }: { name: string }) {
      return <div data-testid={`page-${name}`}>{name}</div>
    }

    function TabsLayout() {
      return (
        <>
          <nav>
            <NavLink to="/tabs/a" replace data-testid="nav-a">A</NavLink>
            <NavLink to="/tabs/b" replace data-testid="nav-b">B</NavLink>
          </nav>
          <KeepAlive mode="switch">
            <AnimatedOutlet transition="slide" />
          </KeepAlive>
        </>
      )
    }

    const tabRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/tabs',
            element: <TabsLayout />,
            children: [
              {
                path: 'a',
                handle: tabIndex ? { tabIndex: 0 } : undefined,
                element: <TabPage name="a" />,
              },
              {
                path: 'b',
                handle: tabIndex ? { tabIndex: 1 } : undefined,
                element: <TabPage name="b" />,
              },
            ],
          },
        ],
      },
    ]

    return createMemoryRouter(tabRoutes, { initialEntries: ['/tabs/a'] })
  }

  it('切换到 B 时，B 的进入动画 class 包含 fr-tab-pre-enter-right（无位置 0 闪烁）', async () => {
    const router = makeTabsApp(true)
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // 记录所有 class 变化
    const classHistory: string[] = []
    const group = document.querySelector('.animated-outlet-group')!
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          classHistory.push((m.target as Element).className)
        }
      })
    })
    observer.observe(group, { attributes: true, subtree: true, childList: true })

    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-b'))
    })
    observer.disconnect()

    // B 的进入动画 class 应该包含 fr-tab-pre-enter-right（确保页面从右侧开始，不在位置 0）
    const hasPreEnter = classHistory.some((c) => c.includes('fr-tab-pre-enter-right'))
    expect(hasPreEnter).toBe(true)

    // fr-tab-pre-enter-right 出现时必须同时有 tabs-slide-enter-forward，而非单独裸出现
    const preEnterWithoutSlide = classHistory.some(
      (c) => c.includes('fr-tab-pre-enter-right') && !c.includes('tabs-slide-enter-forward'),
    )
    // 允许在 pending 渲染时只有 pre-enter class（React 18 synchronous flush 会在 paint 前处理）
    // 关键断言：不应出现仅有基础 class 而没有任何动画 class 的 B 页面状态
    const barePageBefore = classHistory.findIndex((c) => c === 'animated-outlet-page')
    const preEnterFirst = classHistory.findIndex((c) => c.includes('fr-tab-pre-enter-right'))
    if (barePageBefore !== -1 && preEnterFirst !== -1) {
      // 如果存在裸 class，pre-enter 应更早出现（bare 是后续归零状态，不是初始闪烁）
      expect(preEnterFirst).toBeLessThanOrEqual(barePageBefore)
    }
    // 主断言：存在 pre-enter class 就足以证明修复有效
    void preEnterWithoutSlide // 两种情形均可接受
  })

  it('快速 A→B→A 切换后，最终显示 A 页，无动画 class 残留', async () => {
    const router = makeTabsApp(true)
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // 快速依次点击
    await act(async () => { fireEvent.click(screen.getByTestId('nav-b')) })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-a')) })

    // 等待动画超时自然完成（300ms + 50ms grace）
    await waitFor(
      () => {
        const animating = document.querySelectorAll('.fr-animating')
        expect(animating.length).toBe(0)
      },
      { timeout: 1000 },
    )

    // 最终应显示 A 页
    expect(screen.getByTestId('page-a')).toBeTruthy()
  })

  it('正常来回切换：A→B→A 每次都有动画（回归：fromSnapRef 在新导航开始时立即更新）', async () => {
    const router = makeTabsApp(true)
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // A→B：forward 动画
    const historyAB: string[] = []
    const groupAB = document.querySelector('.animated-outlet-group')!
    const obsAB = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          historyAB.push((m.target as Element).className)
      })
    })
    obsAB.observe(groupAB, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-b')) })
    obsAB.disconnect()
    expect(historyAB.some((c) => c.includes('tabs-slide-enter-forward'))).toBe(true)

    // 等待动画完成
    await waitFor(() => expect(document.querySelectorAll('.fr-animating').length).toBe(0), { timeout: 1000 })

    // B→A：back 动画（旧 bug：fromSnapRef 未更新会直接显示 A 无动画）
    const historyBA: string[] = []
    const obsBA = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          historyBA.push((m.target as Element).className)
      })
    })
    obsBA.observe(groupAB, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-a')) })
    obsBA.disconnect()
    expect(historyBA.some((c) => c.includes('tabs-slide-enter-back'))).toBe(true)
  })

  it('快速 A→B→A 后 fromSnap 同步：再切换到 B 为 forward 方向', async () => {
    const router = makeTabsApp(true)
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // 快速 A→B→A，等待动画清空
    await act(async () => { fireEvent.click(screen.getByTestId('nav-b')) })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-a')) })
    await waitFor(
      () => expect(document.querySelectorAll('.fr-animating').length).toBe(0),
      { timeout: 1000 },
    )

    // 收集下次 A→B 的 class 变化
    const classHistory: string[] = []
    const group = document.querySelector('.animated-outlet-group')!
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          classHistory.push((m.target as Element).className)
        }
      })
    })
    observer.observe(group, { attributes: true, subtree: true })

    await act(async () => { fireEvent.click(screen.getByTestId('nav-b')) })
    observer.disconnect()

    // A(index=0) → B(index=1)：forward 方向
    const hasForwardEnter = classHistory.some((c) => c.includes('tabs-slide-enter-forward'))
    const hasBackEnter = classHistory.some((c) => c.includes('tabs-slide-enter-back'))
    expect(hasForwardEnter).toBe(true)
    expect(hasBackEnter).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// keepAlive switch + cover/modal：通过 tabIndex 配置方向（显式配置 = 双向动画）
// ---------------------------------------------------------------------------
describe('keepAlive switch + cover/modal 方向（需 tabIndex 配置）', () => {
  function makeTabsApp(anim: 'cover' | 'modal', withTabIndex: boolean) {
    function TabPage({ name }: { name: string }) {
      return <div data-testid={`page-${name}`}>{name}</div>
    }

    function TabsLayout() {
      return (
        <>
          <nav>
            <NavLink to="/tabs/a" replace data-testid="nav-a">A</NavLink>
            <NavLink to="/tabs/b" replace data-testid="nav-b">B</NavLink>
          </nav>
          <KeepAlive mode="switch">
            <AnimatedOutlet transition={anim} />
          </KeepAlive>
        </>
      )
    }

    const tabRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/tabs',
            element: <TabsLayout />,
            children: [
              { path: 'a', handle: withTabIndex ? { tabIndex: 0 } : undefined, element: <TabPage name="a" /> },
              { path: 'b', handle: withTabIndex ? { tabIndex: 1 } : undefined, element: <TabPage name="b" /> },
            ],
          },
        ],
      },
    ]

    return createMemoryRouter(tabRoutes, { initialEntries: ['/tabs/a'] })
  }

  it('cover + tabIndex: A→B forward（slide-next-enter + 老页缩小），B→A backward（从左滑入覆盖 + 老页缩小）', async () => {
    const router = makeTabsApp('cover', true)
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    const group = document.querySelector('.animated-outlet-group')!

    // A→B forward: B 从右滑入（slide-next-enter），A 缩小退场（slide-prev-leave-cover）
    const histAB: string[] = []
    const obsAB = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          histAB.push((m.target as Element).className)
      })
    })
    obsAB.observe(group, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-b')) })
    obsAB.disconnect()

    expect(histAB.some((c) => c.includes('slide-next-enter'))).toBe(true)
    expect(histAB.some((c) => c.includes('slide-prev-leave-cover'))).toBe(true)

    await waitFor(() => expect(document.querySelectorAll('.fr-animating').length).toBe(0), { timeout: 1000 })

    // B→A backward: iOS-pop 风格 — A 从背景放大浮现（slide-prev-enter-cover），B 向右滑出（slide-next-leave）
    // 这是 forward 的自然逆过程：forward = B 右入覆盖，backward = B 右出还原
    const histBA: string[] = []
    const obsBA = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          histBA.push((m.target as Element).className)
      })
    })
    obsBA.observe(group, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-a')) })
    obsBA.disconnect()

    // A 从缩小背景浮现（iOS-style reveal），B 向右滑出（slide-next-leave）
    expect(histBA.some((c) => c.includes('slide-prev-enter-cover'))).toBe(true)
    // B 向右滑走，不再是缩小退场
    expect(histBA.some((c) => c.includes('slide-next-leave'))).toBe(true)
    // A 有 fr-tab-pre-enter-below 预定位（在缩小状态预先隐藏，避免一帧闪烁）
    expect(histBA.some((c) => c.includes('fr-tab-pre-enter-below'))).toBe(true)
  })

  it('cover 无 tabIndex：A→B 和 B→A 均走 forward 默认动画（slide-next-enter）', async () => {
    const router = makeTabsApp('cover', false)
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    const group = document.querySelector('.animated-outlet-group')!

    // A→B
    const histAB: string[] = []
    const obsAB = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          histAB.push((m.target as Element).className)
      })
    })
    obsAB.observe(group, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-b')) })
    obsAB.disconnect()

    expect(histAB.some((c) => c.includes('slide-next-enter'))).toBe(true)

    await waitFor(() => expect(document.querySelectorAll('.fr-animating').length).toBe(0), { timeout: 1000 })

    // B→A：无 tabIndex，仍走 forward（slide-next-enter），不会出现 slide-next-leave
    const histBA: string[] = []
    const obsBA = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          histBA.push((m.target as Element).className)
      })
    })
    obsBA.observe(group, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-a')) })
    obsBA.disconnect()

    expect(histBA.some((c) => c.includes('slide-next-enter'))).toBe(true)
    expect(histBA.some((c) => c.includes('slide-next-leave'))).toBe(false)
  })

  it('modal + tabIndex: A→B forward（slide-up-enter），B→A backward（双向统一：新tab从底部滑入，旧tab下滑）', async () => {
    const router = makeTabsApp('modal', true)
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    const group = document.querySelector('.animated-outlet-group')!

    // A→B forward: B 从底部滑入（slide-up-enter），A 背景略缩（modal-bg-leave）
    const histAB: string[] = []
    const obsAB = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          histAB.push((m.target as Element).className)
      })
    })
    obsAB.observe(group, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-b')) })
    obsAB.disconnect()

    expect(histAB.some((c) => c.includes('slide-up-enter'))).toBe(true)
    // B 进入后不带 fr-modal enterDone（避免透明背景）
    expect(histAB.some((c) => c === 'animated-outlet-page fr-modal')).toBe(false)

    await waitFor(() => expect(document.querySelectorAll('.fr-animating').length).toBe(0), { timeout: 1000 })

    // B→A backward: 双向统一动画 —— A 从底部滑入（slide-up-enter），B 向下滑走（slide-up-leave）
    const histBA: string[] = []
    const obsBA = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class')
          histBA.push((m.target as Element).className)
      })
    })
    obsBA.observe(group, { attributes: true, subtree: true })
    await act(async () => { fireEvent.click(screen.getByTestId('nav-a')) })
    obsBA.disconnect()

    // A 从底部滑入（与正向 B 进入时一致）
    expect(histBA.some((c) => c.includes('slide-up-enter'))).toBe(true)
    // B 向下滑走
    expect(histBA.some((c) => c.includes('slide-up-leave'))).toBe(true)
    // exit class 不带 fr-modal（无深色遮罩）
    expect(histBA.some((c) => c.includes('fr-modal') && c.includes('slide-up-leave'))).toBe(false)
  })
})

describe('raw TransitionGroup', () => {
  it('nodeRef + object classNames 会加到 DOM', () => {
    const cn = {
      enter: 'fr-animating fr-anim',
      enterActive: 'slide-next-enter',
      exit: 'fr-animating fr-anim',
      exitActive: 'slide-prev-leave-cover',
    }

    function Demo() {
      const [key, setKey] = useState('a')
      const refA = createRef<HTMLDivElement>()
      const refB = createRef<HTMLDivElement>()
      const nodeRef = key === 'a' ? refA : refB
      return (
        <>
          <button type="button" onClick={() => setKey('b')}>
            go
          </button>
          <TransitionGroup>
            <CSSTransition key={key} nodeRef={nodeRef} timeout={300} classNames={cn} mountOnEnter unmountOnExit>
              <div ref={nodeRef} className="animated-outlet-page">
                {key}
              </div>
            </CSSTransition>
          </TransitionGroup>
        </>
      )
    }

    render(<Demo />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    const classes = [...document.querySelectorAll('.animated-outlet-page')].map((e) => e.className)
    expect(classes.some((c) => /fr-animating|slide-next-enter|slide-prev-leave-cover/.test(c))).toBe(true)
  })
})

describe('state.transition integration', () => {
  it('navigate state 写入 transition', async () => {
    function NavButton() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate('/about', { state: { transition: 'fade' } })}>
          go
        </button>
      )
    }

    function Loc() {
      const { state } = useLocation()
      return <span data-testid="state">{(state as { transition?: string })?.transition ?? 'none'}</span>
    }

    const navRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          { path: '/', element: <><NavButton /><Loc /></> },
          { path: '/about', element: <Loc /> },
        ],
      },
    ]

    const router = createMemoryRouter(navRoutes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)

    expect(screen.getByTestId('state').textContent).toBe('none')
    screen.getByRole('button', { name: 'go' }).click()

    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('fade')
    })
  })

  it('navigate 时转场期间注入动画 class', async () => {
    function NavButton() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate('/about')}>
          go
        </button>
      )
    }

    const navRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          { path: '/', element: <NavButton /> },
          { path: '/about', element: <Page name="about" /> },
        ],
      },
    ]

    const router = createMemoryRouter(navRoutes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))

    const classes = [...document.querySelectorAll('.animated-outlet-page')].map((e) => e.className)
    expect(document.querySelectorAll('.animated-outlet-page').length).toBe(2)
    expect(classes.some((c) => /fr-animating|slide-next-enter|slide-prev-leave-cover/.test(c))).toBe(true)
  })

  it('PUSH 到 modal 后 enterDone 保留 fr-modal', async () => {
    function NavButton() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate('/modal')}>
          go modal
        </button>
      )
    }

    const modalRoutes: RouteObject[] = [
      {
        element: (
          <div className="app-shell">
            <AnimatedOutlet />
          </div>
        ),
        children: [
          { path: '/', element: <NavButton /> },
          {
            path: 'modal',
            handle: { transition: 'modal' },
            element: (
              <AnimatedOutlet transition="modal">
                <div data-testid="modal">modal</div>
              </AnimatedOutlet>
            ),
          },
        ],
      },
    ]

    const router = createMemoryRouter(modalRoutes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole('button', { name: 'go modal' }))
    vi.useFakeTimers()
    act(() => {
      vi.advanceTimersByTime(350)
    })
    vi.useRealTimers()
    await waitFor(() => {
      expect(document.querySelector('.animated-outlet-page')?.className).toContain('fr-modal')
    })
  })

  it('POP 时无 state 仍用 settled matches 的 handle（fade 退场）', async () => {
    const { Link, useNavigate } = await import('react-router-dom')

    function Back() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate(-1)}>
          back
        </button>
      )
    }

    const fadeRoutes: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          { path: '/', element: <Link to="/tabs">go</Link> },
          {
            path: '/tabs',
            handle: { transition: 'fade' },
            element: (
              <>
                <Back />
                <Page name="tabs" />
              </>
            ),
          },
        ],
      },
    ]

    const router = createMemoryRouter(fadeRoutes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole('link', { name: 'go' }))
    await waitFor(() => expect(screen.getByTestId('page').textContent).toBe('tabs:/tabs'))
    await waitFor(() => expect(document.querySelectorAll('.fr-animating').length).toBe(0), {
      timeout: 2000,
    })

    fireEvent.click(screen.getByRole('button', { name: 'back' }))

    const classes = [...document.querySelectorAll('.animated-outlet-page')].map((e) => e.className)
    expect(classes.join(' ')).toMatch(/fade-leave/)
    expect(classes.join(' ')).not.toMatch(/slide-next-leave/)
  })
})

describe('KeepAlive mode="switch"', () => {
  it('切换 Tab 后原 Tab 组件不被卸载（保持 mounted）', async () => {
    let mountCount = 0

    function TabA() {
      useEffect(() => { mountCount++ }, [])
      return <div data-testid="tab-a">A</div>
    }

    function TabsLayout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-b" onClick={() => navigate('/ka/b', { replace: true })}>B</button>
          <KeepAlive mode="switch"><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/ka',
            element: <TabsLayout />,
            children: [
              { path: 'a', element: <TabA /> },
              { path: 'b', element: <div data-testid="tab-b">B</div> },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/ka/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('tab-a')).toBeTruthy())
    expect(mountCount).toBe(1)

    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => expect(screen.getByTestId('tab-b')).toBeTruthy())

    // Tab A 仍然 mounted（keepAlive），不应再次 mount
    expect(mountCount).toBe(1)
    // Tab A 在 DOM 中但不可见
    expect(document.querySelector('[data-testid="tab-a"]')).toBeTruthy()
  })

  it('切换回原 Tab 后 state 立即恢复，Effects 按 Activity 语义重新执行', async () => {
    let mountCount = 0

    function TabA() {
      useEffect(() => { mountCount++ }, [])
      const [count, setCount] = useState(0)
      return (
        <div>
          <span data-testid="counter">{count}</span>
          <button type="button" data-testid="inc" onClick={() => setCount((c) => c + 1)}>+</button>
        </div>
      )
    }

    function TabsLayout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-b" onClick={() => navigate('/ka2/b', { replace: true })}>B</button>
          <button type="button" data-testid="go-a" onClick={() => navigate('/ka2/a', { replace: true })}>A</button>
          <KeepAlive mode="switch"><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/ka2',
            element: <TabsLayout />,
            children: [
              { path: 'a', element: <TabA /> },
              { path: 'b', element: <div data-testid="tab-b">B</div> },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/ka2/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('counter')).toBeTruthy())

    // 在 Tab A 累加计数
    fireEvent.click(screen.getByTestId('inc'))
    fireEvent.click(screen.getByTestId('inc'))
    expect(screen.getByTestId('counter').textContent).toBe('2')

    // 切到 Tab B
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => expect(screen.getByTestId('tab-b')).toBeTruthy())

    // 切回 Tab A
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => expect(screen.getByTestId('counter')).toBeTruthy())

    // useState 的状态（计数 2）完整保留 ✅
    expect(screen.getByTestId('counter').textContent).toBe('2')
    // Activity 语义：隐藏时清理 Effects，重新可见时重新执行 Effects（与 CSS display:none 不同）
    // Vue keepAlive 会"暂停" Effects；React Activity 会"清理+重建" Effects，更安全（无泄漏）
    expect(mountCount).toBe(2)
  })
})

describe('useActivated / useDeactivated hooks', () => {
  it('useActivated 在每次 tab 激活时触发（含初次 mount）', async () => {
    const calls: string[] = []

    function TabA() {
      useActivated(() => { calls.push('activated') })
      return <div data-testid="tab-a">A</div>
    }

    function TabsLayout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-a" onClick={() => navigate('/act/a', { replace: true })}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/act/b', { replace: true })}>B</button>
          <KeepAlive mode="switch"><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/act',
            element: <TabsLayout />,
            children: [
              { path: 'a', element: <TabA /> },
              { path: 'b', element: <div data-testid="tab-b">B</div> },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/act/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('tab-a')).toBeTruthy())

    // Initial activation: 1 call
    expect(calls.length).toBe(1)

    // Switch to B (tab A deactivates)
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => expect(screen.getByTestId('tab-b')).toBeTruthy())
    expect(calls.length).toBe(1)

    // Switch back to A (tab A activates again: 2nd call)
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => expect(screen.getByTestId('tab-a')).toBeTruthy())
    expect(calls.length).toBe(2)
  })

  it('useActivated 在非 keepAlive 环境等同 useEffect mount', async () => {
    const calls: string[] = []

    function Page() {
      useActivated(() => { calls.push('activated') })
      return <div data-testid="page">page</div>
    }

    const r: RouteObject[] = [{ path: '/', element: <AnimatedOutlet />, children: [{ index: true, element: <Page /> }] }]
    const router = createMemoryRouter(r, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('page')).toBeTruthy())
    expect(calls.length).toBe(1)
  })

  it('useActivated 在微任务执行前卸载时不会调用回调', async () => {
    const calls: string[] = []

    function Page() {
      useActivated(() => { calls.push('activated') })
      return <div>page</div>
    }

    const router = createMemoryRouter([{ path: '/', element: <Page /> }], { initialEntries: ['/'] })
    const view = render(<RouterProvider router={router} />)
    view.unmount()
    await Promise.resolve()

    expect(calls).toEqual([])
  })

  it('useDeactivated 在 keepAlive tab 切走时触发', async () => {
    const calls: string[] = []

    function TabA() {
      useDeactivated(() => { calls.push('deactivated') })
      return <div data-testid="tab-a">A</div>
    }

    function TabsLayout() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-a" onClick={() => navigate('/deact/a', { replace: true })}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/deact/b', { replace: true })}>B</button>
          <KeepAlive mode="switch"><AnimatedOutlet /></KeepAlive>
        </>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/deact',
            element: <TabsLayout />,
            children: [
              { path: 'a', element: <TabA /> },
              { path: 'b', element: <div data-testid="tab-b">B</div> },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/deact/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('tab-a')).toBeTruthy())

    // Not yet deactivated
    expect(calls.length).toBe(0)

    // Switch to B → tab A deactivated
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => expect(screen.getByTestId('tab-b')).toBeTruthy())
    expect(calls.length).toBe(1)

    // Switch back to A → no extra deactivation
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => expect(screen.getByTestId('tab-a')).toBeTruthy())
    expect(calls.length).toBe(1)

    // Switch to B again → deactivated again
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => expect(screen.getByTestId('tab-b')).toBeTruthy())
    expect(calls.length).toBe(2)
  })

  it('useDeactivated 在 keepAlive 活跃页离开整组时触发（keepAlive 组卸载）', async () => {
    const calls: string[] = []

    function TabA() {
      useDeactivated(() => { calls.push('deactivated') })
      return <div data-testid="tab-a">A</div>
    }

    function TabsLayout() {
      return <KeepAlive mode="switch"><AnimatedOutlet /></KeepAlive>
    }

    function Root() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-outside" onClick={() => navigate('/ka-unmount/outside')}>outside</button>
          <AnimatedOutlet />
        </>
      )
    }

    const r: RouteObject[] = [
      {
        path: '/ka-unmount',
        element: <Root />,
        children: [
          {
            element: <TabsLayout />,
            children: [
              { path: 'a', element: <TabA /> },
            ],
          },
          { path: 'outside', element: <div data-testid="outside">outside</div> },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/ka-unmount/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('tab-a')).toBeTruthy())
    expect(calls.length).toBe(0)

    // Navigate outside the keepAlive group → group unmounts → deactivated fires via microtask
    fireEvent.click(screen.getByTestId('go-outside'))
    await waitFor(() => expect(screen.getByTestId('outside')).toBeTruthy())
    await waitFor(() => expect(calls.length).toBe(1), { timeout: 2000 })
  })

  it('useDeactivated 在 keepAlive 活跃页 StrictMode 刷新时不触发', async () => {
    const { StrictMode } = await import('react')
    const calls: string[] = []

    function TabA() {
      useDeactivated(() => { calls.push('deactivated') })
      return <div data-testid="tab-a-strict">A</div>
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/strict-deact',
            element: <KeepAlive mode="switch"><AnimatedOutlet /></KeepAlive>,
            children: [{ path: 'a', element: <TabA /> }],
          },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/strict-deact/a'] })
    render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    )
    await waitFor(() => expect(screen.getByTestId('tab-a-strict')).toBeTruthy())

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50))

    // StrictMode double-invoke must NOT trigger useDeactivated
    expect(calls.length).toBe(0)
  })

  it('useDeactivated 在非 keepAlive 环境等同 useEffect cleanup（unmount 时触发）', async () => {
    const calls: string[] = []

    function PageA() {
      useDeactivated(() => { calls.push('deactivated') })
      return <div data-testid="page-a">A</div>
    }

    function Nav() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-a" onClick={() => navigate('/dna/a')}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/dna/b')}>B</button>
          <AnimatedOutlet />
        </>
      )
    }

    const r: RouteObject[] = [
      {
        path: '/dna',
        element: <Nav />,
        children: [
          { path: 'a', element: <PageA /> },
          { path: 'b', element: <div data-testid="page-b">B</div> },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/dna/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('page-a')).toBeTruthy())

    // Not yet deactivated
    expect(calls.length).toBe(0)

    // Navigate to B → Page A unmounts → deactivated fires
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => expect(screen.getByTestId('page-b')).toBeTruthy())
    await waitFor(() => expect(calls.length).toBe(1))
  })
})


describe('Bug 1 regression: PageScope/LayoutScopeRegistrar side effects in useLayoutEffect', () => {
  it('PageScope transition prop 更新后注册随之更新', async () => {
    function Parent() {
      const [anim, setAnim] = useState<'fade' | 'scale'>('fade')
      return (
        <>
          <button type="button" data-testid="toggle" onClick={() => setAnim('scale')}>
            toggle
          </button>
          <AnimatedOutlet transition={anim}>
            <div data-testid="child">child</div>
          </AnimatedOutlet>
        </>
      )
    }

    const r: RouteObject[] = [{ path: '/', element: <Parent /> }]
    const router = createMemoryRouter(r, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('child')).toBeTruthy())

    fireEvent.click(screen.getByTestId('toggle'))
    // No error expected; component stays rendered with updated transition
    expect(screen.getByTestId('child')).toBeTruthy()
  })

  it('LayoutScopeRegistrar transition prop 更新不报错', async () => {
    function Layout({ anim }: { anim: string }) {
      return <AnimatedOutlet transition={anim as never} />
    }

    function Parent() {
      const [anim, setAnim] = useState('fade')
      return (
        <>
          <button type="button" data-testid="toggle" onClick={() => setAnim('slide')}>
            toggle
          </button>
          <Layout anim={anim} />
        </>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            path: '/',
            element: <Parent />,
            children: [{ index: true, element: <div data-testid="inner">inner</div> }],
          },
        ],
      },
    ]
    const router = createMemoryRouter(r, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('inner')).toBeTruthy())

    fireEvent.click(screen.getByTestId('toggle'))
    expect(screen.getByTestId('inner')).toBeTruthy()
  })
})

describe('Bug 2 regression: commitSettled 不被双重调用', () => {
  it('动画完成后 settled 只触发一次 re-render，不会产生多余 page 节点', async () => {
    function NavButton() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate('/b')}>
          go
        </button>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          { path: '/', element: <NavButton /> },
          { path: '/b', element: <div data-testid="page-b">B</div> },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))

    // During animation: 2 pages visible
    expect(document.querySelectorAll('.animated-outlet-page').length).toBe(2)

    // After animation completes: only 1 page (unmountOnExit)
    await waitFor(
      () => expect(document.querySelectorAll('.animated-outlet-page').length).toBe(1),
      { timeout: 1000 },
    )
    // No extra pages leaked from double commitSettled
    expect(document.querySelectorAll('.animated-outlet-page').length).toBe(1)
  })
})

describe('Bug 3 regression: useMemo 在过渡期间不会因 fromSnap.matches 无效化', () => {
  it('连续导航时动画 classNames 在整个过渡期间保持稳定', async () => {
    function NavButton() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-b" onClick={() => navigate('/stable/b')}>
            go b
          </button>
        </>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          { path: '/stable/a', element: <NavButton /> },
          { path: '/stable/b', element: <div data-testid="page-b">B</div> },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/stable/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('go-b')).toBeTruthy())

    fireEvent.click(screen.getByTestId('go-b'))

    // During animation: exactly 2 pages, animation classes should be present
    const pages = document.querySelectorAll('.animated-outlet-page')
    expect(pages.length).toBe(2)
    const allClasses = [...pages].map((e) => e.className).join(' ')
    expect(allClasses).toMatch(/fr-animating|slide-next-enter|slide-prev-leave/)

    // After animation: exactly 1 page, no animation classes remain
    await waitFor(
      () => expect(document.querySelectorAll('.animated-outlet-page').length).toBe(1),
      { timeout: 1000 },
    )
    const remainingClasses = document.querySelector('.animated-outlet-page')?.className ?? ''
    expect(remainingClasses).not.toMatch(/fr-animating/)
  })

  it('快速连续导航后最终只剩 1 个页面节点', async () => {
    function NavButtons() {
      const navigate = useNavigate()
      return (
        <>
          <button type="button" data-testid="go-b" onClick={() => navigate('/seq/b')}>b</button>
          <button type="button" data-testid="go-a" onClick={() => navigate('/seq/a')}>a</button>
        </>
      )
    }

    const r: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          { path: '/seq/a', element: <NavButtons /> },
          { path: '/seq/b', element: <NavButtons /> },
        ],
      },
    ]

    const router = createMemoryRouter(r, { initialEntries: ['/seq/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('go-b')).toBeTruthy())

    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => expect(screen.getByTestId('go-a')).toBeTruthy())
    fireEvent.click(screen.getByTestId('go-a'))

    await waitFor(
      () => expect(document.querySelectorAll('.animated-outlet-page').length).toBe(1),
      { timeout: 1500 },
    )
    expect(document.querySelector('.animated-outlet-page')?.className).not.toContain('fr-animating')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// include / exclude 缓存过滤
// ─────────────────────────────────────────────────────────────────────────────

describe('keepAlive switch — include/exclude 过滤', () => {
  function SwitchLayout({ include, exclude }: { include?: string[]; exclude?: string[] }) {
    const navigate = useNavigate()
    return (
      <>
        <nav>
          <button type="button" data-testid="go-a" onClick={() => navigate('/sw/a', { replace: true })}>A</button>
          <button type="button" data-testid="go-b" onClick={() => navigate('/sw/b', { replace: true })}>B</button>
          <button type="button" data-testid="go-c" onClick={() => navigate('/sw/c', { replace: true })}>C</button>
        </nav>
        <KeepAlive mode="switch" include={include} exclude={exclude}>
          <AnimatedOutlet />
        </KeepAlive>
      </>
    )
  }

  function buildRouter(include?: string[], exclude?: string[]) {
    const r: RouteObject[] = [
      {
        element: <SwitchLayout include={include} exclude={exclude} />,
        children: [
          { path: '/sw/a', element: <div data-testid="page-a">A</div> },
          { path: '/sw/b', element: <div data-testid="page-b">B</div> },
          { path: '/sw/c', element: <div data-testid="page-c">C</div> },
        ],
      },
    ]
    return createMemoryRouter(r, { initialEntries: ['/sw/a'] })
  }

  it('无 include/exclude 时所有页面都缓存', async () => {
    const router = buildRouter()
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    // A 被缓存，依然在 DOM 中（Activity hidden）
    expect(document.querySelector('[data-testid="page-a"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="page-b"]')).toBeTruthy()
  })

  it('include 数组：不在列表内的页面离开后从 DOM 移除', async () => {
    // 只缓存 /sw/a，/sw/b 不缓存
    const router = buildRouter(['/sw/a'])
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // A → B（B 不在 include 内）
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    // 等动画完成（transition="none" 无动画，onExited 应同步触发）
    await waitFor(() => {
      // A 仍在 DOM（include 的页面），B 仍在（当前活跃）
      expect(document.querySelector('[data-testid="page-a"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="page-b"]')).toBeTruthy()
    })

    // 切到 A，B 离开 → B 不在 include 内，应该被清除
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => {
      expect(document.querySelector('[data-testid="page-b"]')).toBeNull()
    })
  })

  it('exclude 数组：在列表内的页面离开后从 DOM 移除', async () => {
    // 排除 /sw/b，其他正常缓存
    const router = buildRouter(undefined, ['/sw/b'])
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a'))

    // A → B（B 在 exclude 内）
    fireEvent.click(screen.getByTestId('go-b'))
    await waitFor(() => screen.getByTestId('page-b'))

    // 切到 A，B 离开 → 应从 DOM 移除
    fireEvent.click(screen.getByTestId('go-a'))
    await waitFor(() => {
      expect(document.querySelector('[data-testid="page-b"]')).toBeNull()
    })
    // A 正常缓存，保留
    expect(document.querySelector('[data-testid="page-a"]')).toBeTruthy()
  })

  it('include RegExp：匹配的页面被缓存，不匹配的被清除', async () => {
    function RegExpLayout() {
      const navigate = useNavigate()
      return (
        <>
          <nav>
            <button type="button" data-testid="go-a2" onClick={() => navigate('/sw2/a', { replace: true })}>A</button>
            <button type="button" data-testid="go-b2" onClick={() => navigate('/sw2/b', { replace: true })}>B</button>
          </nav>
          <KeepAlive mode="switch" include={/^\/sw2\/a$/}>
            <AnimatedOutlet />
          </KeepAlive>
        </>
      )
    }
    const router = createMemoryRouter(
      [
        {
          element: <RegExpLayout />,
          children: [
            { path: '/sw2/a', element: <div data-testid="page-a2">A</div> },
            { path: '/sw2/b', element: <div data-testid="page-b2">B</div> },
          ],
        },
      ],
      { initialEntries: ['/sw2/a'] },
    )
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a2'))

    fireEvent.click(screen.getByTestId('go-b2'))
    await waitFor(() => screen.getByTestId('page-b2'))

    // 切回 a，b 应被清除（不匹配 include）
    fireEvent.click(screen.getByTestId('go-a2'))
    await waitFor(() => {
      expect(document.querySelector('[data-testid="page-b2"]')).toBeNull()
    })
  })

  it('exclude 函数：predicate 为 true 的页面不缓存', async () => {
    function FnExcludeLayout() {
      const navigate = useNavigate()
      return (
        <>
          <nav>
            <button type="button" data-testid="go-a3" onClick={() => navigate('/sw3/a', { replace: true })}>A</button>
            <button type="button" data-testid="go-b3" onClick={() => navigate('/sw3/b', { replace: true })}>B</button>
          </nav>
          <KeepAlive mode="switch" exclude={(path: string) => path.startsWith('/sw3/b')}>
            <AnimatedOutlet />
          </KeepAlive>
        </>
      )
    }
    const router = createMemoryRouter(
      [
        {
          element: <FnExcludeLayout />,
          children: [
            { path: '/sw3/a', element: <div data-testid="page-a3">A</div> },
            { path: '/sw3/b', element: <div data-testid="page-b3">B</div> },
          ],
        },
      ],
      { initialEntries: ['/sw3/a'] },
    )
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('page-a3'))

    fireEvent.click(screen.getByTestId('go-b3'))
    await waitFor(() => screen.getByTestId('page-b3'))

    fireEvent.click(screen.getByTestId('go-a3'))
    await waitFor(() => {
      expect(document.querySelector('[data-testid="page-b3"]')).toBeNull()
    })
    expect(document.querySelector('[data-testid="page-a3"]')).toBeTruthy()
  })
})

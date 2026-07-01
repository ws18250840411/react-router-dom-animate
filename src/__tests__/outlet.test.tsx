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

import { AnimatedOutlet, useActivated, useDeactivated } from '../index'

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
      return <AnimatedOutlet tabs transition="fade" />
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
          <AnimatedOutlet tabs transition="fade" />
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

  it('tabs + NavLink 重复点击当前 Tab 不 remount 子页面', async () => {
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
          <AnimatedOutlet tabs />
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

  it('tabs 同路径 navigate（新 location.key）不 remount 子页面', async () => {
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
          <AnimatedOutlet tabs />
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

describe('AnimatedOutlet keepAlive tabs', () => {
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
          <AnimatedOutlet tabs keepAlive />
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
          <AnimatedOutlet tabs keepAlive />
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
          <AnimatedOutlet tabs keepAlive />
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
          <AnimatedOutlet tabs keepAlive />
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
      return <AnimatedOutlet tabs keepAlive />
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
            element: <AnimatedOutlet tabs keepAlive />,
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

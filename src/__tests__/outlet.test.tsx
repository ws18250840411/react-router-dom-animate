/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef, useState } from 'react'
import { CSSTransition, TransitionGroup } from 'react-transition-group'
import {
  RouterProvider,
  createMemoryRouter,
  useLocation,
  type RouteObject,
} from 'react-router-dom'

import { AnimatedOutlet } from '../index'

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
      return <AnimatedOutlet transition="fade" />
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

describe('useAnimatedNavigate integration', () => {
  it('push 带 transition 写入 state', async () => {
    const { useAnimatedNavigate } = await import('../navigate')

    function NavButton() {
      const navigate = useAnimatedNavigate()
      return (
        <button type="button" onClick={() => navigate.push('/about', { transition: 'fade' })}>
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

  it('push 时转场期间注入动画 class', async () => {
    const { useAnimatedNavigate } = await import('../navigate')

    function NavButton() {
      const navigate = useAnimatedNavigate()
      return (
        <button type="button" onClick={() => navigate.push('/about')}>
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
    const { useAnimatedNavigate } = await import('../navigate')

    function NavButton() {
      const navigate = useAnimatedNavigate()
      return (
        <button type="button" onClick={() => navigate.push('/modal')}>
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

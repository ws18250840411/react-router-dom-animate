/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, Link, type RouteObject } from 'react-router-dom'
import AnimatedOutlet from '../outlet'
import { layoutRouteId, sameLayoutPage } from '../transition'

function Page({ id }: { id: string }) {
  return <div data-testid={id}>page</div>
}

function TabsLayout() {
  return (
    <div data-testid="tabs-layout">
      <main>
        <AnimatedOutlet mode="switch" transition="slide" />
      </main>
      <nav data-testid="tab-nav">
        <Link to="/tabs/a" replace>
          A
        </Link>
        <Link to="/tabs/b" replace>
          B
        </Link>
      </nav>
    </div>
  )
}

const routes: RouteObject[] = [
  {
    element: <AnimatedOutlet />,
    children: [
      {
        path: '/tabs',
        handle: { transition: 'slide', mode: 'switch' },
        element: <TabsLayout />,
        children: [
          { path: 'a', handle: { tabIndex: 0 }, element: <Page id="tab-a-page" /> },
          { path: 'b', handle: { tabIndex: 1 }, element: <Page id="tab-b-page" /> },
        ],
      },
    ],
  },
]

describe('layoutRouteId', () => {
  it('兄弟 Tab 路由共享父 layout id', () => {
    const layoutId = 'layout-tabs-slide'
    const from = {
      path: '/tabs/a',
      key: 'k1',
      state: null,
      matches: [
        { id: 'root', pathname: '/' },
        { id: layoutId, pathname: '/tabs' },
        { id: 'tab-a', pathname: 'a' },
      ],
    }
    const to = {
      path: '/tabs/b',
      key: 'k2',
      state: null,
      matches: [
        { id: 'root', pathname: '/' },
        { id: layoutId, pathname: '/tabs' },
        { id: 'tab-b', pathname: 'b' },
      ],
    }

    expect(layoutRouteId(from.matches as never, from.path)).toBe(layoutId)
    expect(layoutRouteId(to.matches as never, to.path)).toBe(layoutId)
    expect(sameLayoutPage(from as never, to as never)).toBe(true)
  })

  it('列表进详情不算 sameLayoutPage（同 layout 但路径加深）', () => {
    const layoutId = 'layout-catalog'
    const from = {
      path: '/catalog',
      key: 'k1',
      state: null,
      matches: [
        { id: 'root', pathname: '/' },
        { id: layoutId, pathname: '/catalog' },
        { id: 'list', pathname: '/catalog' },
      ],
    }
    const to = {
      path: '/catalog/1',
      key: 'k2',
      state: null,
      matches: [
        { id: 'root', pathname: '/' },
        { id: layoutId, pathname: '/catalog' },
        { id: 'detail', pathname: '1' },
      ],
    }

    expect(sameLayoutPage(from as never, to as never)).toBe(false)
  })

  it('Tab A→B 时根层 nav 不参与 slide', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/tabs/a'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('tab-a-page')).toBeTruthy())

    fireEvent.click(screen.getByRole('link', { name: 'B' }))
    await waitFor(() => expect(screen.getByTestId('tab-b-page')).toBeTruthy())

    await waitFor(() => {
      const rootPage = document.querySelector('[data-testid="tab-nav"]')?.closest('.animated-outlet-page')
      expect(rootPage?.className.includes('slide-next-enter')).toBeFalsy()
      expect(rootPage?.className.includes('tabs-slide')).toBeFalsy()
    })
  })

  it('中间层 Auth Outlet 在 Tab 切换时不播 cover', async () => {
    function AuthLayout() {
      return <AnimatedOutlet />
    }

    function TabsLayout() {
      return (
        <div data-testid="tabs-shell">
          <main>
            <AnimatedOutlet mode="switch" transition="fade" />
          </main>
          <nav data-testid="tab-nav">
            <Link to="/home" replace>
              Home
            </Link>
            <Link to="/profile" replace>
              Profile
            </Link>
          </nav>
        </div>
      )
    }

    const nested: RouteObject[] = [
      {
        element: <AnimatedOutlet />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              {
                element: <TabsLayout />,
                children: [
                  { path: '/home', element: <Page id="home-page" /> },
                  { path: '/profile', element: <Page id="profile-page" /> },
                ],
              },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(nested, { initialEntries: ['/home'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('home-page')).toBeTruthy())

    fireEvent.click(screen.getByRole('link', { name: 'Profile' }))
    await waitFor(() => expect(screen.getByTestId('profile-page')).toBeTruthy())

    const shell = document.querySelector('[data-testid="tabs-shell"]')
    const shellPage = shell?.closest('.animated-outlet-page')
    expect(shellPage?.className.includes('slide-next-enter')).toBeFalsy()
    expect(shellPage?.className.includes('slide-prev-enter-cover')).toBeFalsy()
    expect(shellPage?.className.includes('slide-prev-leave-cover')).toBeFalsy()
  })
})

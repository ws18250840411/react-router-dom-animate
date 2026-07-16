/**
 * @vitest-environment jsdom
 */
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router-dom'

import { AnimatedOutlet, KeepAlive } from '../index'

afterEach(() => cleanup())

function isActuallyVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current) {
    if (getComputedStyle(current).display === 'none') return false
    current = current.parentElement
  }
  return true
}

describe('root layout KeepAlive contract', () => {
  it('根配置缓存菜单，嵌套 switch 即时切换，文章返回保持原实例', async () => {
    let homeInitializations = 0

    function Home() {
      const [count, setCount] = useState(() => {
        homeInitializations += 1
        return 0
      })
      return (
        <div data-page="home">
          <span data-testid="home-count">{count}</span>
          <button onClick={() => setCount((value) => value + 1)}>increment</button>
        </div>
      )
    }

    function TabsLayout() {
      return <AnimatedOutlet mode="switch" />
    }

    function RootLayout() {
      return (
        <KeepAlive include={['HomeTab', 'DiscoverTab', 'ProfileTab']} max={3}>
          <AnimatedOutlet />
        </KeepAlive>
      )
    }

    const routes: RouteObject[] = [
      {
        element: <RootLayout />,
        children: [
          {
            element: <Outlet />,
            children: [
              {
                element: <TabsLayout />,
                children: [
                  {
                    path: '/home',
                    element: <Home />,
                    handle: { keepAliveName: 'HomeTab', tabIndex: 0 },
                  },
                  {
                    path: '/discover',
                    element: <div data-page="discover">discover</div>,
                    handle: { keepAliveName: 'DiscoverTab', tabIndex: 1 },
                  },
                  {
                    path: '/profile',
                    element: <div data-page="profile">profile</div>,
                    handle: { keepAliveName: 'ProfileTab', tabIndex: 2 },
                  },
                ],
              },
              {
                path: '/article/:id',
                element: <div data-page="article">article</div>,
                handle: { transition: 'cover' },
              },
            ],
          },
        ],
      },
    ]

    const router = createMemoryRouter(routes, { initialEntries: ['/home'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('home-count'))
    fireEvent.click(screen.getByRole('button', { name: 'increment' }))

    await act(async () => {
      for (let index = 0; index < 100; index++) {
        const path = ['/home', '/discover', '/profile'][index % 3]!
        await router.navigate(path, { replace: true })
      }
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
    const visibleMenuPages = [...document.querySelectorAll<HTMLElement>('[data-page]')]
      .filter((element) => element.dataset.page !== 'article')
      .filter(isActuallyVisible)
    expect(visibleMenuPages.map((element) => element.dataset.page)).toEqual(['home'])
    expect(screen.getByTestId('home-count').textContent).toBe('1')

    await act(async () => router.navigate('/article/1'))
    await waitFor(() => expect(screen.getByText('article')).toBeTruthy())
    await act(async () => router.navigate(-1))
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))

    expect(screen.getByTestId('home-count').textContent).toBe('1')
    expect(homeInitializations).toBe(1)
  })
})

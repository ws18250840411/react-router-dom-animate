// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AnimatedOutlet } from '/Users/wangwenshan/Desktop/wws/other/react-router-dom-animate/src/index'

describe('keepAlive stack mode state preservation', () => {
  it('PUSH→POP 保留 useState', async () => {
    let mountCount = 0

    function ListPage() {
      const [count, setCount] = useState(0)
      useEffect(() => {
        mountCount++
        console.log('[List] MOUNT, mountCount:', mountCount)
        return () => console.log('[List] UNMOUNT, count was:', count)
      }, [])

      return (
        <div>
          <span data-testid="counter">{count}</span>
          <button data-testid="inc" onClick={() => setCount(c => c + 1)}>+</button>
          <a data-testid="go-detail" href="/detail">detail</a>
        </div>
      )
    }

    function Layout() {
      return <AnimatedOutlet keepAlive transition="none" />
    }

    const router = createMemoryRouter([
      {
        path: '/',
        element: <Layout />,
        children: [
          { index: true, element: <ListPage /> },
          { path: 'detail', element: <div data-testid="detail">Detail</div> },
        ]
      }
    ], { initialEntries: ['/'] })

    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('counter'))
    
    // Increment
    fireEvent.click(screen.getByTestId('inc'))
    fireEvent.click(screen.getByTestId('inc'))
    expect(screen.getByTestId('counter').textContent).toBe('2')

    // Navigate to detail
    await act(async () => { router.navigate('/detail') })
    await waitFor(() => screen.getByTestId('detail'))

    // Navigate back
    await act(async () => { router.navigate(-1) })
    await waitFor(() => screen.getByTestId('counter'))

    console.log('mountCount after:', mountCount)
    console.log('counter value:', screen.getByTestId('counter').textContent)

    expect(screen.getByTestId('counter').textContent).toBe('2')
  })
})

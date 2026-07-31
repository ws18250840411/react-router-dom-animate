import React from 'react'
import { createRoot } from 'react-dom/client'
import { Link, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

function RootLayout() {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>react-router-dom-animate</h2>
      <p style={{ marginTop: 0, color: '#666' }}>StackBlitz 示例（npm 包接入，不依赖仓库源码）</p>
      <AnimatedOutlet transition="cover" />
    </div>
  )
}

function Home() {
  return (
    <div>
      <p>Home 页面</p>
      <Link to="/detail/1">进入详情页</Link>
    </div>
  )
}

function Detail() {
  return (
    <div>
      <p>Detail 页面</p>
      <Link to="/">返回首页</Link>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'detail/:id', element: <Detail /> },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)

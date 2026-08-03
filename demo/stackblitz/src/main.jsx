import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Link,
  NavLink,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { AnimatedOutlet, KeepAlive, useActivated, useDeactivated } from 'react-router-dom-animate'
import './styles.css'

function RootLayout() {
  const [transition, setTransition] = useState('cover')
  const [mode, setMode] = useState('stack')

  const controls = useMemo(
    () => ({
      transition,
      mode,
    }),
    [transition, mode],
  )

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>react-router-dom-animate</h1>
        <p>
          在线功能体验（基于 npm 包接入，不依赖仓库源码）
          <span className="chip">React Router 7</span>
          <span className="chip">React 19</span>
        </p>
        <div className="control-grid">
          <label>
            全局转场
            <select value={transition} onChange={(e) => setTransition(e.target.value)}>
              <option value="cover">cover（默认）</option>
              <option value="slide">slide</option>
              <option value="fade">fade</option>
              <option value="scale">scale</option>
              <option value="modal">modal</option>
              <option value="none">none</option>
            </select>
          </label>
          <label>
            根布局模式
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="stack">stack（有方向）</option>
              <option value="switch">switch（平级切换）</option>
            </select>
          </label>
        </div>
        <nav className="top-nav">
          <NavLink to="/">首页</NavLink>
          <NavLink to="/transitions">转场体验</NavLink>
          <NavLink to="/stack/list">列表详情</NavLink>
          <NavLink to="/tabs/a">KeepAlive Tabs</NavLink>
        </nav>
      </header>
      <main className="page-wrap">
        <AnimatedOutlet transition={controls.transition} mode={controls.mode} />
      </main>
    </div>
  )
}

function Home() {
  return (
    <section className="card-grid">
      <FeatureCard
        title="1. 转场类型"
        desc="cover / slide / fade / scale / modal / none，支持路由 state 动态覆盖。"
        to="/transitions"
      />
      <FeatureCard
        title="2. 列表详情（stack）"
        desc="进入详情再返回，体验有方向感的前进/后退动画。"
        to="/stack/list"
      />
      <FeatureCard
        title="3. KeepAlive Tabs"
        desc="切 tab 不丢输入和计数，展示 switch 模式缓存。"
        to="/tabs/a"
      />
      <FeatureCard
        title="4. 生命周期 hooks"
        desc="每次页面激活/离开都会记录日志（useActivated / useDeactivated）。"
        to="/tabs/a"
      />
    </section>
  )
}

function FeatureCard({ title, desc, to }) {
  return (
    <article className="feature-card">
      <h3>{title}</h3>
      <p>{desc}</p>
      <Link className="btn" to={to}>
        立即体验
      </Link>
    </article>
  )
}

function TransitionPlayground() {
  const navigate = useNavigate()
  const location = useLocation()

  const open = (type) => {
    const id = Math.floor(Math.random() * 900 + 100)
    navigate(`/transitions/detail/${id}`, {
      state: { transition: type, from: location.pathname },
    })
  }

  return (
    <section className="panel">
      <h2>转场体验区</h2>
      <p>点击不同按钮，用 state 覆盖当前跳转的动画类型。</p>
      <div className="btn-row">
        {['cover', 'slide', 'fade', 'scale', 'modal', 'none'].map((name) => (
          <button key={name} onClick={() => open(name)}>
            {name}
          </button>
        ))}
      </div>
      <p className="hint">提示：进入详情后点“返回上一页”，可以观察反向动画。</p>
    </section>
  )
}

function TransitionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/transitions'
  const t = location.state?.transition || 'cover'

  return (
    <section className="panel">
      <h2>详情页 #{id}</h2>
      <p>本次进入动画：{t}</p>
      <div className="btn-row">
        <button onClick={() => navigate(-1)}>返回上一页</button>
        <button onClick={() => navigate(from, { replace: true })}>回到转场体验首页</button>
      </div>
    </section>
  )
}

function StackLayout() {
  return (
    <section className="panel">
      <h2>列表 / 详情（stack）</h2>
      <p>这是典型移动端场景：前进覆盖、后退回收。</p>
      <AnimatedOutlet transition="cover" mode="stack" />
    </section>
  )
}

function StackList() {
  const items = Array.from({ length: 8 }, (_, i) => i + 1)
  return (
    <div className="list">
      {items.map((id) => (
        <Link key={id} className="list-item" to={`/stack/detail/${id}`}>
          商品详情 #{id}
        </Link>
      ))}
    </div>
  )
}

function StackDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  return (
    <section className="panel sub-panel">
      <h3>商品详情 #{id}</h3>
      <p>点返回看反向动画，或直接跳回列表。</p>
      <div className="btn-row">
        <button onClick={() => navigate(-1)}>返回</button>
        <Link className="btn ghost" to="/stack/list">
          回列表
        </Link>
      </div>
    </section>
  )
}

function TabsLayout() {
  return (
    <section className="panel">
      <h2>KeepAlive Tabs（switch）</h2>
      <p>切换 A / B / C 时，输入框、计数器、滚动位置保持不丢失。</p>
      <nav className="tab-nav">
        <NavLink to="/tabs/a">Tab A</NavLink>
        <NavLink to="/tabs/b">Tab B</NavLink>
        <NavLink to="/tabs/c">Tab C</NavLink>
      </nav>

      <KeepAlive mode="switch" max={5}>
        <AnimatedOutlet transition="slide" />
      </KeepAlive>
    </section>
  )
}

function TabPage({ name, color }) {
  const [count, setCount] = useState(0)
  const [text, setText] = useState('')
  const [logs, setLogs] = useState([])

  const appendLog = (line) => setLogs((prev) => [line, ...prev].slice(0, 4))

  useActivated(() => appendLog(`${new Date().toLocaleTimeString()} 页面激活`))
  useDeactivated(() => appendLog(`${new Date().toLocaleTimeString()} 页面离开`))

  return (
    <div className="tab-card" style={{ borderColor: color }}>
      <h3>
        {name}（状态保留测试）
      </h3>
      <div className="btn-row">
        <button onClick={() => setCount((v) => v + 1)}>计数 +1</button>
        <button onClick={() => setCount(0)}>重置</button>
      </div>
      <p>当前计数：{count}</p>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="输入内容后切到其他 tab 再回来" />
      <div className="mini-log">
        {logs.map((line, i) => (
          <p key={`${line}-${i}`}>{line}</p>
        ))}
      </div>
    </div>
  )
}

function TabA() {
  return <TabPage name="Tab A" color="#3b82f6" />
}

function TabB() {
  return <TabPage name="Tab B" color="#10b981" />
}

function TabC() {
  return <TabPage name="Tab C" color="#8b5cf6" />
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'transitions', element: <TransitionPlayground /> },
      { path: 'transitions/detail/:id', element: <TransitionDetail /> },
      {
        path: 'stack',
        element: <StackLayout />,
        children: [
          { path: 'list', element: <StackList /> },
          { path: 'detail/:id', element: <StackDetail /> },
        ],
      },
      {
        path: 'tabs',
        element: <TabsLayout />,
        children: [
          { path: 'a', element: <TabA /> },
          { path: 'b', element: <TabB /> },
          { path: 'c', element: <TabC /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)

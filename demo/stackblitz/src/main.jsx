import React, { useRef, useMemo, useState } from 'react'
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

// ===========================================================================
// Root Layout - 全局控制 + 转场回调指示器
// ===========================================================================

function RootLayout() {
  const [transition, setTransition] = useState('cover')
  const [mode, setMode] = useState('stack')
  const [isTransitioning, setIsTransitioning] = useState(false)

  const controls = useMemo(() => ({ transition, mode }), [transition, mode])

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>react-router-dom-animate</h1>
        <p>
          在线功能体验（基于 npm 包接入，不依赖仓库源码）
          <span className="chip">React Router 7</span>
          <span className="chip">React 19</span>
          {isTransitioning && <span className="chip chip-active">转场中…</span>}
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
          <NavLink to="/alive-ref">缓存控制</NavLink>
        </nav>
      </header>
      <main className="page-wrap">
        {/* onTransitionStart/End 回调：驱动 header 中的"转场中"指示器 */}
        <AnimatedOutlet
          transition={controls.transition}
          mode={controls.mode}
          onTransitionStart={() => setIsTransitioning(true)}
          onTransitionEnd={() => setIsTransitioning(false)}
        />
      </main>
    </div>
  )
}

// ===========================================================================
// Home - 功能导览
// ===========================================================================

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
        desc="切 tab 不丢输入和计数，展示 switch 模式 + tabIndex 方向感动画。"
        to="/tabs/a"
      />
      <FeatureCard
        title="4. 生命周期 hooks"
        desc="每次页面激活/离开都会记录日志（useActivated / useDeactivated）。"
        to="/tabs/a"
      />
      <FeatureCard
        title="5. 转场回调（onTransitionStart/End）"
        desc="顶部 header 出现「转场中…」徽章即为回调触发，导航即可观察。"
        to="/transitions"
      />
      <FeatureCard
        title="6. 命令式缓存控制（aliveRef）"
        desc="查看当前缓存列表、手动清除指定页面缓存。"
        to="/alive-ref"
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

// ===========================================================================
// TransitionPlayground - 动态覆盖转场类型
// ===========================================================================

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
      <p>点击不同按钮，用 <code>navigate(url, &#123; state: &#123; transition &#125; &#125;)</code> 覆盖当前跳转的动画类型。</p>
      <div className="btn-row">
        {['cover', 'slide', 'fade', 'scale', 'modal', 'none'].map((name) => (
          <button key={name} onClick={() => open(name)}>
            {name}
          </button>
        ))}
      </div>
      <p className="hint">提示：进入详情后点「返回上一页」，可以观察反向动画。顶部 header 的「转场中…」徽章由 <code>onTransitionStart/End</code> 驱动。</p>
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
      <p>本次进入动画：<strong>{t}</strong></p>
      <div className="btn-row">
        <button onClick={() => navigate(-1)}>返回上一页</button>
        <button onClick={() => navigate(from, { replace: true })}>回到转场体验首页</button>
      </div>
    </section>
  )
}

// ===========================================================================
// Stack - 列表 → 详情（stack 模式 + KeepAlive 保留背景页）
// ===========================================================================

function StackLayout() {
  return (
    <section className="panel">
      <h2>列表 / 详情（stack）</h2>
      <p>典型移动端场景：前进覆盖、后退回收；<code>&lt;KeepAlive&gt;</code> 保留背景页状态与滚动位置。</p>
      <KeepAlive>
        <AnimatedOutlet transition="cover" mode="stack" />
      </KeepAlive>
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

// ===========================================================================
// Tabs - KeepAlive switch + tabIndex 方向感动画
// ===========================================================================

function TabsLayout() {
  return (
    <section className="panel">
      <h2>KeepAlive Tabs（switch + tabIndex）</h2>
      <p>
        切换 A / B / C 时，输入框、计数器保持不丢失。路由 <code>handle.tabIndex</code> 让
        slide 动画有方向感：小 → 大 = 向右滑入，大 → 小 = 向左滑入。
      </p>
      <nav className="tab-nav">
        <NavLink to="/tabs/a">Tab A</NavLink>
        <NavLink to="/tabs/b">Tab B</NavLink>
        <NavLink to="/tabs/c">Tab C</NavLink>
      </nav>

      <KeepAlive mode="switch" max={5}>
        {/* slide 搭配 tabIndex 实现有方向感的 Tab 切换 */}
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
      <h3>{name}（状态保留测试）</h3>
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

function TabA() { return <TabPage name="Tab A" color="#3b82f6" /> }
function TabB() { return <TabPage name="Tab B" color="#10b981" /> }
function TabC() { return <TabPage name="Tab C" color="#8b5cf6" /> }

// ===========================================================================
// AliveRefDemo - 命令式缓存控制（aliveRef）
// ===========================================================================

const sharedAliveRef = { current: undefined }

function AliveRefLayout() {
  const aliveRef = useRef(undefined)
  // 共享 ref 以便父组件可以调用
  sharedAliveRef.current = aliveRef.current

  const [cached, setCached] = useState([])

  const refresh = () => {
    const list = aliveRef.current?.getCached() ?? []
    setCached([...list])
  }

  return (
    <section className="panel">
      <h2>命令式缓存控制（aliveRef）</h2>
      <p>
        访问多个 Tab 后，通过 <code>aliveRef</code> 查看和清除缓存。
      </p>
      <nav className="tab-nav">
        <NavLink to="/alive-ref/x">页面 X</NavLink>
        <NavLink to="/alive-ref/y">页面 Y</NavLink>
        <NavLink to="/alive-ref/z">页面 Z</NavLink>
      </nav>

      <KeepAlive mode="switch" max={10} aliveRef={aliveRef}>
        <AnimatedOutlet transition="fade" />
      </KeepAlive>

      <div className="alive-controls">
        <div className="btn-row">
          <button onClick={refresh}>刷新缓存列表</button>
          <button
            onClick={() => {
              aliveRef.current?.removeAll()
              setTimeout(refresh, 0)
            }}
          >
            清空所有缓存
          </button>
        </div>
        <div className="cache-list">
          <strong>当前缓存：</strong>
          {cached.length === 0
            ? <span className="hint">（空）先访问几个页面再刷新</span>
            : cached.map((p) => (
              <span key={p} className="cache-tag">
                {p}
                <button
                  className="remove-btn"
                  onClick={() => {
                    aliveRef.current?.remove(p)
                    setTimeout(refresh, 0)
                  }}
                >
                  ×
                </button>
              </span>
            ))}
        </div>
      </div>
    </section>
  )
}

function AliveRefPage({ name, color }) {
  const [count, setCount] = useState(0)
  useActivated(() => console.log(`[${name}] activated`))
  useDeactivated(() => console.log(`[${name}] deactivated`))

  return (
    <div className="tab-card" style={{ borderColor: color }}>
      <h3>{name}（缓存测试）</h3>
      <div className="btn-row">
        <button onClick={() => setCount((v) => v + 1)}>计数 +1</button>
        <button onClick={() => setCount(0)}>重置</button>
      </div>
      <p>当前计数：{count}</p>
      <p className="hint">切换页面后回来，如果缓存有效则计数保留；清除缓存后回来则重置。</p>
    </div>
  )
}

function AliveRefX() { return <AliveRefPage name="页面 X" color="#f59e0b" /> }
function AliveRefY() { return <AliveRefPage name="页面 Y" color="#ef4444" /> }
function AliveRefZ() { return <AliveRefPage name="页面 Z" color="#06b6d4" /> }

// ===========================================================================
// Router
// ===========================================================================

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
          // tabIndex 让 slide 动画知道方向：A(0) → B(1) = 向右，B(1) → A(0) = 向左
          { path: 'a', handle: { tabIndex: 0 }, element: <TabA /> },
          { path: 'b', handle: { tabIndex: 1 }, element: <TabB /> },
          { path: 'c', handle: { tabIndex: 2 }, element: <TabC /> },
        ],
      },
      {
        path: 'alive-ref',
        element: <AliveRefLayout />,
        children: [
          { path: 'x', element: <AliveRefX /> },
          { path: 'y', element: <AliveRefY /> },
          { path: 'z', element: <AliveRefZ /> },
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

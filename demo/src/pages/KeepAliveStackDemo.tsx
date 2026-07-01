import { useRef, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

// Layout: keepAlive stack mode — list → detail → back
export function KeepAliveStackLayout() {
  const navigate = useNavigate()
  return (
    <div className="app-shell">
      <header className="subbar">
        <button type="button" className="tab secondary" data-testid="ka-stack-back" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span>keepAlive 栈模式 — 列表保活</span>
      </header>
      <main className="app-main">
        {/* keepAlive without mode="switch" = stack mode */}
        <AnimatedOutlet keepAlive transition="cover" />
      </main>
    </div>
  )
}

// List page: counter + scroll to prove state is kept when returning from detail
export function KeepAliveStackList() {
  const [count, setCount] = useState(0)
  const renders = useRef(0)
  renders.current += 1

  return (
    <div className="page" data-testid="ka-stack-list">
      <h1>商品列表（keepAlive）</h1>
      <p className="hint">
        点击商品进入详情，返回后计数器和滚动位置完整保留（不重新渲染）。
        <br />
        <span style={{ opacity: 0.5, fontSize: 12 }}>renders: {renders.current}</span>
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0' }}>
        <button type="button" data-testid="ka-stack-dec" onClick={() => setCount((c) => c - 1)}>−</button>
        <span data-testid="ka-stack-counter" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'center', fontSize: 24 }}>{count}</span>
        <button type="button" data-testid="ka-stack-inc" onClick={() => setCount((c) => c + 1)}>+</button>
      </div>

      {/* Scrollable list */}
      <div
        data-testid="ka-stack-scroll"
        style={{ height: 400, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}
      >
        <nav className="tabs" style={{ flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((id) => (
            <NavLink
              key={id}
              to={`/keep-alive-stack/${id}`}
              data-testid={`ka-stack-item-${id}`}
              className="tab"
              style={{ justifyContent: 'flex-start' }}
            >
              商品 {id}
            </NavLink>
          ))}
          {/* Extra items to make scroll area meaningful */}
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i + 10} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', opacity: 0.4, fontSize: 12 }}>
              占位条目 {i + 1}
            </div>
          ))}
        </nav>
      </div>
    </div>
  )
}

// Detail page
export function KeepAliveStackDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const renders = useRef(0)
  renders.current += 1

  return (
    <div className="page" data-testid="ka-stack-detail">
      <h1>商品 {id}</h1>
      <p className="hint">返回后列表页状态不丢失。renders: {renders.current}</p>
      <button
        type="button"
        className="tab secondary"
        data-testid="ka-stack-detail-back"
        onClick={() => navigate(-1)}
      >
        ← 返回列表
      </button>
    </div>
  )
}

import { useRef, useState } from 'react'
import { Navigate, NavLink, useNavigate } from 'react-router-dom'
import type { KeepAliveRef } from 'react-router-dom-animate'
import { AnimatedOutlet, useActivated, useDeactivated } from 'react-router-dom-animate'

// ─── Tab A: counter + scroll ────────────────────────────────────────────────

export function KeepAliveTabA() {
  const [count, setCount] = useState(0)
  const renders = useRef(0)
  renders.current += 1

  useActivated(() => console.log('[TabA] activated'))
  useDeactivated(() => console.log('[TabA] deactivated'))

  return (
    <div className="page" data-testid="ka-tab-a">
      <h2>Tab A — 计数器 + 滚动</h2>
      <p className="hint">切换到 Tab B 再切回来，计数和滚动位置不丢失</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button type="button" data-testid="ka-dec" onClick={() => setCount((c) => c - 1)}>−</button>
        <span data-testid="ka-counter" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'center', fontSize: 24 }}>{count}</span>
        <button type="button" data-testid="ka-inc" onClick={() => setCount((c) => c + 1)}>+</button>
        <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 12 }}>renders: {renders.current}</span>
      </div>

      <div style={{ height: 600, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }} data-testid="ka-scroll-area">
        {Array.from({ length: 30 }, (_, i) => (
          <p key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            第 {i + 1} 行 — 向下滚动后切走再切回，位置保留 ✓
          </p>
        ))}
      </div>
    </div>
  )
}

// ─── Tab B: text input ────────────────────────────────────────────────────────

export function KeepAliveTabB() {
  const [text, setText] = useState('')

  useActivated(() => console.log('[TabB] activated'))
  useDeactivated(() => console.log('[TabB] deactivated'))

  return (
    <div className="page" data-testid="ka-tab-b">
      <h2>Tab B — 文本输入</h2>
      <p className="hint">输入文字后切走再切回，内容不丢失</p>
      <input
        type="text"
        data-testid="ka-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入一段文字..."
        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 16 }}
      />
      <p style={{ marginTop: 8, opacity: 0.6 }}>当前值：{text || '(空)'}</p>
    </div>
  )
}

// ─── Tab C: shows after cache cleared ────────────────────────────────────────

export function KeepAliveTabC() {
  const [count, setCount] = useState(0)
  return (
    <div className="page" data-testid="ka-tab-c">
      <h2>Tab C — 另一个计数器</h2>
      <p className="hint">用于演示 aliveRef.remove() 精确清除指定 tab</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => setCount((c) => c - 1)}>−</button>
        <span data-testid="ka-counter-c" style={{ minWidth: 40, textAlign: 'center', fontSize: 24 }}>{count}</span>
        <button type="button" onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
    </div>
  )
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function KeepAliveIndex() {
  return <Navigate to="a" replace />
}

export function KeepAliveLayout() {
  const navigate = useNavigate()
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  return (
    <div className="app-shell">
      <header className="subbar">
        <button type="button" className="tab secondary" data-testid="ka-back" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span>keepAlive Demo</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="tab secondary"
            data-testid="ka-remove-a"
            onClick={() => {
              aliveRef.current?.remove('/keep-alive/a')
              navigate('/keep-alive/a')
            }}
            title="清除 Tab A 缓存（状态重置）"
          >
            清 A
          </button>
          <button
            type="button"
            className="tab secondary"
            data-testid="ka-remove-all"
            onClick={() => {
              aliveRef.current?.removeAll()
            }}
            title="清除所有非活跃 tab 的缓存"
          >
            清全部
          </button>
        </div>
      </header>

      <main className="app-main">
        <AnimatedOutlet keepAlive mode="switch" max={5} aliveRef={aliveRef} />
      </main>

      <nav className="tabs">
        {(['a', 'b', 'c'] as const).map((key) => (
          <NavLink
            key={key}
            to={`/keep-alive/${key}`}
            replace
            data-testid={`ka-tab-link-${key}`}
            className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
          >
            Tab {key.toUpperCase()}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

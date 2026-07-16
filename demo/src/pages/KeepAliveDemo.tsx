import { useRef, useState, useCallback } from 'react'
import { Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { KeepAliveRef, RouteAnimType } from 'react-router-dom-animate'
import { AnimatedOutlet, KeepAlive, useActivated, useDeactivated } from 'react-router-dom-animate'

// ─── Filter demo (include / exclude) ────────────────────────────────────────

// ─── Tab A: counter + scroll ────────────────────────────────────────────────

export function KeepAliveTabA() {
  const [count, setCount] = useState(0)
  const renders = useRef(0)
  renders.current += 1
  const [lifecycle, setLifecycle] = useState<{ event: string; time: string }[]>([])

  const pushEvent = useCallback((event: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLifecycle((prev) => [...prev.slice(-4), { event, time }])
  }, [])

  useActivated(() => pushEvent('activated'))
  useDeactivated(() => pushEvent('deactivated'))

  return (
    <div className="page" data-testid="ka-tab-a">
      <h2>Tab A — 计数器 + 滚动</h2>
      <p className="hint">切换到其他 Tab 再切回，计数和滚动位置不丢失</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <button type="button" data-testid="ka-dec" onClick={() => setCount((c) => c - 1)}>−</button>
        <span data-testid="ka-counter" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'center', fontSize: 24 }}>{count}</span>
        <button type="button" data-testid="ka-inc" onClick={() => setCount((c) => c + 1)}>+</button>
        <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 12 }}>renders: {renders.current}</span>
      </div>

      {/* Lifecycle event log */}
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', minHeight: 36 }}>
        <span style={{ fontSize: 11, opacity: 0.5 }}>useActivated / useDeactivated: </span>
        {lifecycle.length === 0
          ? <span style={{ fontSize: 12, opacity: 0.4 }}>（切换 tab 后触发）</span>
          : lifecycle.map((e, i) => (
            <span key={i} style={{ fontSize: 12, marginLeft: 6, color: e.event === 'activated' ? '#16a34a' : '#dc2626' }}>
              {e.event} {e.time}
            </span>
          ))
        }
      </div>

      <div style={{ height: 520, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }} data-testid="ka-scroll-area">
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
  const [active, setActive] = useState(false)

  useActivated(() => setActive(true))
  useDeactivated(() => setActive(false))

  return (
    <div className="page" data-testid="ka-tab-b">
      <h2>Tab B — 文本输入</h2>
      <p className="hint">输入文字后切走再切回，内容不丢失</p>

      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#16a34a' : '#64748b' }}>
          {active ? '● 当前激活' : '○ 已离开'}
        </span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>— useActivated / useDeactivated</span>
      </div>

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

const ANIM_OPTIONS: { label: string; value: RouteAnimType | undefined }[] = [
  { label: 'none', value: undefined },
  { label: 'cover', value: 'cover' },
  { label: 'modal', value: 'modal' },
  { label: 'slide', value: 'slide' },
  { label: 'fade', value: 'fade' },
  { label: 'scale', value: 'scale' },
]

const MAX_CACHE = 5

/** 读取当前缓存列表并格式化显示 — 每次 location 变化时重新读取 */
function CachedBadge({ aliveRef }: { aliveRef: React.RefObject<KeepAliveRef | undefined> }) {
  const { pathname } = useLocation() // 订阅 location 变化，路由切换后自动重渲染
  const cached = aliveRef.current?.getCached() ?? []
  return (
    <div style={{ fontSize: 11, padding: '4px 12px', background: 'rgba(0,0,0,0.04)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <span style={{ opacity: 0.5, whiteSpace: 'nowrap' }}>LRU 缓存 ({cached.length}/{MAX_CACHE}):</span>
      {cached.length === 0
        ? <span style={{ opacity: 0.35 }}>（空）</span>
        : cached.map((p, i) => {
          const isActive = p === pathname
          const isLRUOldest = i === 0 && cached.length >= MAX_CACHE
          return (
            <code
              key={p}
              title={isActive ? '当前页面' : isLRUOldest ? '下一个被驱逐（最旧）' : '已缓存'}
              style={{
                borderRadius: 3,
                padding: '1px 5px',
                background: isActive ? 'rgba(22,163,74,0.15)' : isLRUOldest ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
                color: isActive ? '#16a34a' : isLRUOldest ? '#dc2626' : '#3b82f6',
                border: `1px solid ${isActive ? 'rgba(22,163,74,0.3)' : isLRUOldest ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
              }}
            >
              {p.replace('/keep-alive/', '')}
              {isActive ? ' ●' : isLRUOldest ? ' ⚠' : ''}
            </code>
          )
        })
      }
      <span style={{ opacity: 0.35, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
        超出 {MAX_CACHE} 个后驱逐最旧（红色）
      </span>
    </div>
  )
}

export function KeepAliveLayout() {
  const navigate = useNavigate()
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)
  const [anim, setAnim] = useState<RouteAnimType | undefined>(undefined)

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

      {/* 实时显示 LRU 缓存状态 */}
      <CachedBadge aliveRef={aliveRef} />

      <div style={{ display: 'flex', gap: 6, padding: '6px 12px', background: 'rgba(0,0,0,0.04)', fontSize: 12 }}>
        <span style={{ opacity: 0.5, alignSelf: 'center' }}>transition:</span>
        {ANIM_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            data-testid={`ka-anim-${opt.label}`}
            onClick={() => setAnim(opt.value)}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: anim === opt.value ? '#3b82f6' : 'white',
              color: anim === opt.value ? 'white' : 'inherit',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <main className="app-main">
        {/* max=5：正常使用不触发驱逐；getCached() 实时反映缓存状态 */}
        <KeepAlive mode="switch" max={MAX_CACHE} aliveRef={aliveRef}>
          <AnimatedOutlet transition={anim} />
        </KeepAlive>
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

// ─── include / exclude demo ──────────────────────────────────────────────────

const filterMountCounts = new Map<string, number>()

/** Simple page that tracks mount count — re-mount means the cache was cleared. */
function FilterPage({ name, testId }: { name: string; testId: string }) {
  const [count, setCount] = useState(0)
  const [mountCount] = useState(() => {
    const next = (filterMountCounts.get(testId) ?? 0) + 1
    filterMountCounts.set(testId, next)
    return next
  })

  return (
    <div className="page" data-testid={testId}>
      <h2>Page {name}</h2>
      <p>Mount count: <span data-testid={`${testId}-mount`}>{mountCount}</span></p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <button type="button" data-testid={`${testId}-dec`} onClick={() => setCount((c) => c - 1)}>−</button>
        <span data-testid={`${testId}-count`} style={{ minWidth: 40, textAlign: 'center' }}>{count}</span>
        <button type="button" data-testid={`${testId}-inc`} onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
    </div>
  )
}

export function FilterPageA() { return <FilterPage name="A（缓存）" testId="kf-page-a" /> }
export function FilterPageB() { return <FilterPage name="B（不缓存）" testId="kf-page-b" /> }
export function FilterPageC() { return <FilterPage name="C（缓存）" testId="kf-page-c" /> }
export function FilterIndex() { return <Navigate to="a" replace /> }

/**
 * 演示 exclude prop：页面 B 被排除在缓存外，
 * 离开后再回来会重新 mount（mount count +1，计数清零）。
 * A、C 正常缓存，state 保留。
 */
export function FilterLayout() {
  const navigate = useNavigate()
  const BASE = '/keep-alive-filter'

  return (
    <div className="app-shell">
      <header className="subbar">
        <button type="button" className="tab secondary" onClick={() => navigate(-1)}>← 返回</button>
        <span>include/exclude Demo</span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          B 页面设置了 <code>exclude</code>，切走后状态不保留
        </span>
      </header>

      <main className="app-main">
        {/* 只缓存 A、C；B 每次进入都重新 mount */}
        <KeepAlive mode="switch" exclude={[`${BASE}/b`]}>
          <AnimatedOutlet />
        </KeepAlive>
      </main>

      <nav className="tabs">
        {(['a', 'b', 'c'] as const).map((key) => (
          <NavLink
            key={key}
            to={`${BASE}/${key}`}
            replace
            data-testid={`kf-tab-link-${key}`}
            className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
          >
            Tab {key.toUpperCase()}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

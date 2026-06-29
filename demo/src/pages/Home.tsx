import { Link, useNavigate } from 'react-router-dom'
import type { RouteAnimType } from 'react-router-dom-animate'

type Scenario = {
  key: string
  label: string
  transition: RouteAnimType
  pushTo: string
  wrapTo: string
}

const DEFAULT_SCENARIO: Scenario = {
  key: 'detail',
  label: 'Detail',
  transition: 'cover',
  pushTo: '/push/detail',
  wrapTo: '/wrap/detail',
}

const EXPLICIT_SCENARIOS: Scenario[] = [
  { key: 'cover', label: 'Cover', transition: 'cover', pushTo: '/push/cover', wrapTo: '/wrap/cover' },
  { key: 'slide', label: 'Slide', transition: 'slide', pushTo: '/push/slide', wrapTo: '/wrap/slide' },
  { key: 'fade', label: 'Fade', transition: 'fade', pushTo: '/push/fade', wrapTo: '/wrap/fade' },
  { key: 'scale', label: 'Scale', transition: 'scale', pushTo: '/push/scale', wrapTo: '/wrap/scale' },
  { key: 'modal', label: 'Modal', transition: 'modal', pushTo: '/push/modal', wrapTo: '/wrap/modal' },
  { key: 'tabs', label: 'Tabs · fade', transition: 'fade', pushTo: '/push/tabs/a', wrapTo: '/wrap/tabs/a' },
  {
    key: 'tabs-slide',
    label: 'Tabs · slide (A/B/C)',
    transition: 'slide',
    pushTo: '/push/tabs-slide/a',
    wrapTo: '/wrap/tabs-slide/a',
  },
  {
    key: 'tabs-indicator',
    label: 'Tabs · 毛玻璃滑块',
    transition: 'none',
    pushTo: '/push/tabs-indicator/a',
    wrapTo: '/wrap/tabs-indicator/a',
  },
  { key: 'catalog', label: 'Catalog · stack', transition: 'cover', pushTo: '/push/catalog', wrapTo: '/wrap/catalog' },
]

function MatrixHead() {
  return (
    <div className="matrix-head">
      <span>场景</span>
      <span>transition</span>
      <span>JS / Push</span>
      <span>Link</span>
    </div>
  )
}

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="page" data-testid="home-page">
      <h1>Demo</h1>
      <p className="lede">
        写法 A（<code>/push</code>）：<code>navigate(to, {'{ state }'})</code> 传动画配置，Outlet 保持最简。
        写法 B（<code>/wrap</code>）：在路由 <code>handle</code> 或 <code>AnimatedOutlet</code> 上声明，跳转用普通{' '}
        <code>navigate</code> / <code>NavLink</code>。
      </p>

      <section className="matrix-section" data-testid="matrix-default">
        <h2 className="matrix-section-title">全局默认</h2>
        <div className="matrix">
          <MatrixHead />
          <div className="matrix-row matrix-row--default">
            <span className="matrix-label">{DEFAULT_SCENARIO.label}</span>
            <code className="matrix-type">cover (默认)</code>
            <button
              type="button"
              data-testid={`push-${DEFAULT_SCENARIO.key}`}
              onClick={() => navigate(DEFAULT_SCENARIO.pushTo)}
            >
              Push
            </button>
            <Link to={DEFAULT_SCENARIO.wrapTo} className="tab" data-testid={`link-${DEFAULT_SCENARIO.key}`}>
              Link
            </Link>
          </div>
        </div>
      </section>

      <section className="matrix-section" data-testid="matrix-explicit">
        <h2 className="matrix-section-title">显式配置</h2>
        <div className="matrix">
          <MatrixHead />
          {EXPLICIT_SCENARIOS.map((s) => (
            <div key={s.key} className="matrix-row">
              <span className="matrix-label">{s.label}</span>
              <code className="matrix-type">{s.transition}</code>
              <button
                type="button"
                data-testid={`push-${s.key}`}
                onClick={() => navigate(s.pushTo, { state: { transition: s.transition, tabs: !!s.key.startsWith('tabs') } })}
              >
                JS
              </button>
              <Link to={s.wrapTo} className="tab" data-testid={`link-${s.key}`}>
                Link
              </Link>
            </div>
          ))}
        </div>
      </section>

      <p className="hint">
        Tabs 用 tabs + fade/slide（slide 含 A/B/C 三 Tab）；滑块示例为 none + CSS 指示器；Catalog 演示列表→详情 stack。
      </p>
    </div>
  )
}

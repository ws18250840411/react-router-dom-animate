import { NavLink, useNavigate } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

type TabsLayoutProps = {
  basePath: '/push/tabs' | '/wrap/tabs'
}

/** 内层 AnimatedOutlet 负责 Tab 切换 fade */
export function TabsLayout({ basePath }: TabsLayoutProps) {
  const navigate = useNavigate()
  const mode = basePath.startsWith('/push') ? 'push' : 'wrap'

  return (
    <div className="app-shell">
      <header className="subbar">
        <button type="button" className="tab secondary" data-testid="back-tabs" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span>{mode} / tabs · fade</span>
      </header>
      <main className="app-main">
        <AnimatedOutlet transition="fade" />
      </main>
      <nav className="tabs">
        <NavLink
          to={`${basePath}/a`}
          replace
          data-testid="tab-link-a"
          className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
        >
          A
        </NavLink>
        <NavLink
          to={`${basePath}/b`}
          replace
          data-testid="tab-link-b"
          className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
        >
          B
        </NavLink>
      </nav>
    </div>
  )
}

import { NavLink, useNavigate } from 'react-router-dom'
import type { RouteAnimType } from 'react-router-dom-animate'
import { AnimatedOutlet } from 'react-router-dom-animate'

type TabKey = 'a' | 'b' | 'c'

type TabsLayoutProps = {
  basePath: '/push/tabs' | '/wrap/tabs' | '/push/tabs-slide' | '/wrap/tabs-slide'
  transition: RouteAnimType
  tabKeys?: TabKey[]
}

export function TabsLayout({ basePath, transition, tabKeys = ['a', 'b'] }: TabsLayoutProps) {
  const navigate = useNavigate()
  const isPush = basePath.startsWith('/push')
  const tabState = { transition, mode: 'switch' } as const

  return (
    <div className="app-shell">
      <header className="subbar">
        <button type="button" className="tab secondary" data-testid="back-tabs" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span>
          {isPush ? 'push' : 'wrap'} / tabs · {transition}
          {tabKeys.length > 2 ? ` · ${tabKeys.length} tabs` : ''}
        </span>
      </header>
      <main className="app-main">
        {isPush ? (
          <AnimatedOutlet />
        ) : (
          <AnimatedOutlet mode="switch" transition={transition} />
        )}
      </main>
      <nav className="tabs">
        {tabKeys.map((key) =>
          isPush ? (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`${basePath}/${key}`, { replace: true, state: tabState })}
              data-testid={`tab-link-${key}`}
              className="tab"
            >
              {key.toUpperCase()}
            </button>
          ) : (
            <NavLink
              key={key}
              to={`${basePath}/${key}`}
              replace
              data-testid={`tab-link-${key}`}
              className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
            >
              {key.toUpperCase()}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}

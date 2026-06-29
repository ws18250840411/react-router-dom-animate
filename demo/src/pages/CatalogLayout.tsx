import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

type CatalogLayoutProps = {
  basePath: '/push/catalog' | '/wrap/catalog'
}

export function CatalogLayout({ basePath }: CatalogLayoutProps) {
  const navigate = useNavigate()
  const isPush = basePath.startsWith('/push')

  return (
    <div className="app-shell">
      <header className="subbar">
        <button type="button" className="tab secondary" data-testid="back-catalog" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span>{isPush ? 'push' : 'wrap'} / catalog · cover · stack</span>
      </header>
      <main className="app-main">
        {isPush ? (
          <AnimatedOutlet />
        ) : (
          <AnimatedOutlet mode="stack" transition="cover" />
        )}
      </main>
    </div>
  )
}

export function CatalogList({ basePath }: { basePath: CatalogLayoutProps['basePath'] }) {
  const isPush = basePath.startsWith('/push')
  const navigate = useNavigate()
  const stackState = { transition: 'cover', mode: 'stack' } as const

  return (
    <div className="page" data-testid="catalog-list">
      <h1>商品列表</h1>
      <p className="hint">点击进入详情，栈式 cover 推入。</p>
      <nav className="tabs">
        {isPush ? (
          <button
            type="button"
            onClick={() => navigate(`${basePath}/1`, { state: stackState })}
            data-testid="catalog-item-1"
            className="tab"
          >
            商品 1
          </button>
        ) : (
          <NavLink to={`${basePath}/1`} data-testid="catalog-item-1" className="tab">
            商品 1
          </NavLink>
        )}
      </nav>
    </div>
  )
}

export function CatalogDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <div className="page" data-testid="catalog-detail">
      <h1>商品 {id}</h1>
      <button type="button" className="tab secondary" data-testid="catalog-detail-back" onClick={() => navigate(-1)}>
        ← 返回列表
      </button>
    </div>
  )
}

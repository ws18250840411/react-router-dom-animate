# react-router-dom-animate

为 [react-router-dom](https://reactrouter.com/) 提供栈式页面转场的轻量动画库，基于 [react-transition-group](https://reactcommunity.org/react-transition-group/)。

## 特性

- 支持嵌套 `AnimatedOutlet`，不同区域可配置不同动画
- 支持 JS（`navigate` + `state`）与组件（`handle` / props）两种配置方式
- 可通过 `registerAnimPreset` 扩展自定义预设

## 安装

```bash
npm install react-router-dom-animate
```

**Peer dependencies:** `react` ≥18、`react-dom` ≥18、`react-router-dom` ≥7

## 快速开始

三步接入：

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

// 1. 根路由挂上 AnimatedOutlet（默认 cover）
// 2. 子路由照常写页面
// 3. 跳转照旧用 navigate / Link
const router = createBrowserRouter([
  {
    element: <AnimatedOutlet />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
    ],
  },
])
```

## AnimatedOutlet

| Prop | 作用 | 默认 |
|------|------|------|
| `transition` | 动画类型 | `cover` |
| `tabs` | Tab 平级切换；转场范围限定在 Outlet 子树，不包含同级导航布局 | — |
| `mode` | `stack` 压栈进详情；`switch` 平级切换（设 `tabs` 时自动 `switch`） | `stack` |

`transition` 可选：`cover` · `slide` · `fade` · `scale` · `modal` · `none`

根级默认 `cover`；全站改用其他类型时，例如：`<AnimatedOutlet transition="slide" />`。后退 `navigate(-1)` 不必再传 `state`。

### 两种写法，效果相同

写法 A 在跳转时用 `state` 传配置；写法 B 在路由 `handle` 或 `<AnimatedOutlet>` 上声明，跳转保持普通写法。

| | 写法 A：`navigate` + `state` | 写法 B：路由 / 组件声明 |
|--|------------------------------|-------------------------|
| 配置写在哪 | `navigate()` 的第二个参数 | 路由 `handle` 或 `<AnimatedOutlet …>` |
| 路由怎么写 | 子页面直接挂路由 | `handle` 和/或包一层 `AnimatedOutlet` |
| 怎么跳转 | `navigate(to, { state: { … } })` | `navigate(to)` / `Link` / `NavLink` |

下面三个场景，两种写法**视觉效果一致**。Demo 中 `/push/*` 对应 A，`/wrap/*` 对应 B。

#### 1. 普通换页（fade）

**写法 A**

```tsx
// routes.tsx — 页面直接作为子路由
{ path: 'about', element: <AboutPage /> }

// 跳转时带上 state
navigate('/about', { state: { transition: 'fade' } })
```

**写法 B**

```tsx
// routes.tsx — 在路由上声明动画
{
  path: 'about',
  handle: { transition: 'fade' },
  element: (
    <AnimatedOutlet transition="fade">
      <AboutPage /> // 也可以直接在 AboutPage 页面里包裹一个 AnimatedOutlet 组件一样效果
    </AnimatedOutlet>
  ),
}

// 普通跳转即可
navigate('/about')
```

#### 2. 底栏 Tab（fade）

布局上将导航与页面出口分离：`<nav>` 与 `<AnimatedOutlet>` 同级，转场仅作用于 Outlet 子树。

**写法 A**

```tsx
// routes.tsx
{ path: 'tabs', element: <TabsLayout />, children: [
  { path: 'a', element: <TabA /> },
  { path: 'b', element: <TabB /> },
]}

// TabsLayout.tsx
const navigate = useNavigate()
<nav>
  <button type="button" onClick={() => navigate('/tabs/a', { replace: true, state: { tabs: true, transition: 'fade' } })}>A</button>
  <button type="button" onClick={() => navigate('/tabs/b', { replace: true, state: { tabs: true, transition: 'fade' } })}>B</button>
</nav>
<AnimatedOutlet />
```

**写法 B**

```tsx
// routes.tsx
{
  path: 'tabs',
  handle: { tabs: true, transition: 'fade' },
  element: <TabsLayout />,
  children: [
    { path: 'a', element: <TabA /> },
    { path: 'b', element: <TabB /> },
  ],
}

// TabsLayout.tsx
<nav>
  <NavLink to="/tabs/a" replace>A</NavLink>
  <NavLink to="/tabs/b" replace>B</NavLink>
</nav>
<AnimatedOutlet tabs transition="fade" />
```

`transition="slide"` 时左右滑动；路径无法表示 Tab 顺序时，补充 `tabIndex`（A 写在 `state`，B 写在路由 `handle`）。

#### 3. 列表 → 详情（stack + cover）

**写法 A**

```tsx
// routes.tsx
{ path: 'catalog', element: <CatalogLayout />, children: [
  { index: true, element: <CatalogList /> },
  { path: ':id', element: <CatalogDetail /> },
]}

// CatalogLayout.tsx
<AnimatedOutlet />

// CatalogList.tsx
const navigate = useNavigate()
<button type="button" onClick={() => navigate('/catalog/1', { state: { mode: 'stack', transition: 'cover' } })}>
  商品 1
</button>
```

**写法 B**

```tsx
// routes.tsx
{
  path: 'catalog',
  handle: { mode: 'stack', transition: 'cover' },
  element: <CatalogLayout />,
  children: [
    { index: true, element: <CatalogList /> },
    { path: ':id', element: <CatalogDetail /> },
  ],
}

// CatalogLayout.tsx
<AnimatedOutlet mode="stack" transition="cover" />

// CatalogList.tsx
<NavLink to="/catalog/1">商品 1</NavLink>
```

## Demo

```bash
npm run demo
```

`http://localhost:5180` — `/push/*` 是写法 A，`/wrap/*` 是写法 B。

## API

| 导出 | 说明 |
|------|------|
| `AnimatedOutlet` | 转场出口 |
| `registerAnimPreset` | 注册自定义 `transition` |
| `RouteAnimType` · `OutletMode` · `AnimPreset` | 类型 |

## 开发与验证

```bash
npm run build && npm test && npm run e2e
```

MIT

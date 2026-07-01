# react-router-dom-animate

为 [react-router-dom](https://reactrouter.com/) 提供栈式页面转场的轻量动画库，基于 [react-transition-group](https://reactcommunity.org/react-transition-group/)，可快速通过 JS 或组件方式实现页面动画。

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

### 1. 入口 `main.tsx`

```tsx
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { routes } from './routes'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
)
```

### 2. 路由 `routes.tsx`

根路由挂上 `AnimatedOutlet`，子路由照常写页面：

```tsx
import type { RouteObject } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'
import { HomePage } from './pages/HomePage'
import { AboutPage } from './pages/AboutPage'

export const routes: RouteObject[] = [
  {
    element: <AnimatedOutlet />, // 全站默认 cover
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
    ],
  },
]
```

### 3. 页面组件

```tsx
// pages/HomePage.tsx
import { useNavigate } from 'react-router-dom'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div>
      <h1>Home</h1>
      <button type="button" onClick={() => navigate('/about')}>
        去 About（默认 cover）
      </button>
    </div>
  )
}
```

```tsx
// pages/AboutPage.tsx
export function AboutPage() {
  return <h1>About</h1>
}
```

### 4. 指定动画（二选一）

**写法 A** — 跳转时带 `state`：

```tsx
navigate('/about', { state: { transition: 'fade' } })
```

**写法 B** — 路由或组件上声明：

```tsx
// 方式 1：写在 routes.tsx
{
  path: 'about',
  element: (
    <AnimatedOutlet transition="fade">
      <AboutPage />
    </AnimatedOutlet>
  ),
}

// 方式 2：直接写在页面里，不依赖 routes 配置
// pages/AboutPage.tsx
export function AboutPage() {
  return (
    <AnimatedOutlet transition="fade">
      <div>About 内容</div>
    </AnimatedOutlet>
  )
}
```

两种方式效果相同，跳转用普通 `navigate('/about')` 即可。

后退 `navigate(-1)` 不必再传 `state`。列表进详情见下文；底栏 Tab 见「Tab 用法」。

## 参考

| Prop | 作用 | 默认 |
|------|------|------|
| `transition` | `cover` · `slide` · `fade` · `scale` · `modal` · `none` | `cover` |
| `tabs` | Tab 平级切换（见「Tab 用法」） | — |
| `mode` | `stack` 压栈进详情；`switch` 平级切换 | `stack` |

### 列表 → 详情

```tsx
// 写法 A
navigate('/catalog/1', { state: { mode: 'stack', transition: 'cover' } })

// 写法 B — 布局组件
<AnimatedOutlet mode="stack" transition="cover" />
```

## Tab 用法

底栏 Tab 只需两件事：**菜单在 `<AnimatedOutlet>` 外**，**内容区加 `tabs`**。默认即时切换（`none`），不卡顿；要动画再写 `transition="fade"` 或 `"slide"`。

### 1. 路由 `routes.tsx`

```tsx
{
  path: 'tabs',
  element: <TabsLayout />,
  children: [
    { path: 'home', element: <HomeTab /> },
    { path: 'profile', element: <ProfileTab /> },
  ],
}
```

### 2. 布局 `TabsLayout.tsx`

```tsx
import { NavLink } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

export function TabsLayout() {
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-hidden">
        <AnimatedOutlet tabs />
      </main>
      <nav className="flex border-t">
        <NavLink to="/tabs/home" replace>首页</NavLink>
        <NavLink to="/tabs/profile" replace>我的</NavLink>
      </nav>
    </div>
  )
}
```

要点：`nav` 与 `<AnimatedOutlet tabs>` **同级**；菜单不参与转场。

### 3. Tab 子页面

```tsx
// pages/HomeTab.tsx
export function HomeTab() {
  return <h1>首页</h1>
}
```

### 4. 指定 Tab 动画（可选，二选一）

不写 `transition` 时默认 **即时切换**。需要动画时：

**写法 A** — 跳转时带 `state`：

```tsx
navigate('/tabs/profile', { replace: true, state: { tabs: true, transition: 'fade' } })
```

**写法 B** — 组件上声明：

```tsx
<AnimatedOutlet tabs transition="fade" />
// 或 fade / slide
<AnimatedOutlet tabs transition="slide" />
```

`slide` 时左右滑动；多 Tab 且路径无法表示顺序时，加 `tabIndex`（A 写 `state`，B 写 `handle`）。

> **注意**：使用 `transition="slide"` 时，**必须**在每个 Tab 子路由的 `handle` 中配置 `tabIndex`（或通过跳转 `state.tabIndex` 传入），否则无法判断滑动方向，会自动降级为 `fade` 动画：
>
> ```tsx
> { path: 'home', handle: { tabIndex: 0 }, element: <HomeTab /> }
> { path: 'profile', handle: { tabIndex: 1 }, element: <ProfileTab /> }
> ```

菜单样式、滑块等由业务实现，见 Demo `/push/tabs-indicator`。

## 自定义动画时长

### CSS 变量（推荐）

全局时长通过 `--fr-duration` 控制（默认 300ms），每种动画类型可单独通过 `--fr-duration-{type}` 覆盖：

```css
:root {
  /* 全局兜底，所有未单独设置的类型都使用这个值 */
  --fr-duration: 300ms;

  /* 按类型单独设置（可选，不写则继承全局值） */
  --fr-duration-cover: 300ms;   /* cover：新页面从右侧覆盖进来 */
  --fr-duration-slide: 280ms;   /* slide：新旧页面同向滑动 */
  --fr-duration-fade: 200ms;    /* fade：淡入淡出 */
  --fr-duration-scale: 250ms;   /* scale：缩放 */
  --fr-duration-modal: 450ms;   /* modal：底部弹出，通常慢一些更自然 */
  --fr-duration-none: 0ms;      /* none：无动画（通常不需要设置） */
}
```

### JS（可选）

仅需修改时长时用 `setAnimDuration`，无需重写 CSS 类名：

```tsx
import { setAnimDuration } from 'react-router-dom-animate'

setAnimDuration('modal', 450)
setAnimDuration('slide', 250)
```

如需**同时替换动画样式**，用 `registerAnimPreset`：

```tsx
import { registerAnimPreset } from 'react-router-dom-animate'

registerAnimPreset({
  type: 'my-flip',
  forward: { enter: 'flip-enter', enterActive: 'flip-enter-active', exit: 'flip-exit', exitActive: 'flip-exit-active' },
  back:    { enter: 'flip-enter-back', enterActive: 'flip-enter-back-active', exit: 'flip-exit-back', exitActive: 'flip-exit-back-active' },
  durationMs: 600,
})
```

**优先级**：`registerAnimPreset({ durationMs })` / `setAnimDuration` > `--fr-duration-{type}` > `--fr-duration`

## 进阶 API

### keepAlive：基于 React 19 `<Activity>` 的页面常驻

`keepAlive` 底层使用 React 19.2 官方 [`<Activity>`](https://react.dev/reference/react/Activity) 原语实现，无第三方依赖。

```tsx
// 与任意配置搭配使用
<AnimatedOutlet keepAlive />
<AnimatedOutlet keepAlive transition="fade" />
<AnimatedOutlet tabs keepAlive transition="slide" />
<AnimatedOutlet mode="switch" keepAlive transition="fade" />
```

启用后切换页面**不会 remount** 组件，组件 state、DOM 节点（含滚动位置）、已加载数据完整保留。

#### `max`：LRU 内存上限（推荐配置）

```tsx
<AnimatedOutlet keepAlive max={10} />
```

超过 `max` 时按 LRU（最近最少访问）策略自动淘汰最老的页面缓存。不传 `max` 时不限制。

> **提示**：Tabs 类应用建议 `max={20}`，避免长期使用后内存增长。

#### `aliveRef`：命令式缓存控制

需要主动清除缓存（如登出、刷新某页）时使用：

```tsx
import { useRef } from 'react'
import type { KeepAliveRef } from 'react-router-dom-animate'
import { AnimatedOutlet } from 'react-router-dom-animate'

function Layout() {
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  return (
    <>
      {/* 精确清除：缓存移除后下次访问重新 mount */}
      <button onClick={() => aliveRef.current?.remove('/profile')}>清除个人页缓存</button>
      {/* 全量清除：不含当前活跃页 */}
      <button onClick={() => aliveRef.current?.removeAll()}>登出 — 清除所有缓存</button>

      <AnimatedOutlet keepAlive aliveRef={aliveRef} />
    </>
  )
}
```

| 方法 | 说明 |
|------|------|
| `remove(pathname)` | 移除指定 pathname 的缓存，下次访问重新 mount |
| `removeAll()` | 移除所有非当前活跃页的缓存 |
| `getCached()` | 返回当前缓存的所有 pathname 列表 |

#### 从路由 `handle` 读取 `keepAlive` 配置

无需给每个 `AnimatedOutlet` 手动传 `keepAlive` prop，可在路由 `handle` 中统一声明：

```ts
// routes.tsx
{
  path: 'tabs',
  handle: { keepAlive: true, transition: 'fade', tabs: true },
  element: <TabsLayout />,  // 内部 AnimatedOutlet 无需任何 prop
}
```

prop 的优先级高于 handle，二者可混用。

#### 与 Vue `keepAlive` 的差异

| 行为 | Vue `keepAlive` | React `<Activity>` |
|------|-----------------|---------------------|
| 组件状态（state） | ✅ 保留 | ✅ 保留 |
| DOM / scrollTop | ✅ 保留 | ✅ 保留（DOM 节点不销毁） |
| `useEffect` | ⏸ 暂停，不清理 | 🔄 隐藏时清理，显示时重跑 |
| `onActivated` | 专属生命周期 | `useActivated` |
| `onDeactivated` | 专属生命周期 | `useDeactivated` |

> **实际影响**：如果页面有轮询、WebSocket 等副作用，切走时会自动清理，切回时会重新建立——这通常是更安全的行为。

### `useActivated` / `useDeactivated`：页面进入与离开的生命周期回调

`keepAlive` 模式下组件不会 remount，通过这两个 hook 可以监听页面的激活与离开：

```tsx
import { useActivated, useDeactivated } from 'react-router-dom-animate'

function ProfilePage() {
  const [data, setData] = useState([])

  // 每次页面变为活跃时执行（含首次 mount）
  useActivated(() => {
    fetch('/api/profile').then(r => r.json()).then(setData)
  })

  // 页面离开时执行（隐藏 / 卸载）
  useDeactivated(() => {
    abortController.abort()
  })

  return <Profile data={data} />
}
```

| | keepAlive 模式 | 非 keepAlive |
|--|--------------|------------|
| `useActivated` | 每次页面变为活跃时触发（含首次 mount） | 等同 `useEffect(() => cb(), [])` |
| `useDeactivated` | 页面隐藏 / 整体卸载时触发 | 等同 `useEffect(() => () => cb(), [])` |

## Demo

```bash
npm run demo   # http://localhost:5180
```

`/push/*` = 写法 A（`state`），`/wrap/*` = 写法 B（组件 / `handle`）；`/keep-alive` = KeepAlive 完整示例。

MIT

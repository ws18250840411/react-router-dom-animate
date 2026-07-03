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
| `mode` | `stack` 压栈进详情；`switch` 平级切换（底部 Tab 等） | `stack` |
| `keepAlive` | 页面保活。`mode="stack"`：栈模式（列表→详情）；`mode="switch"`：Switch 模式（Tab 缓存） | — |

### 列表 → 详情

```tsx
// 写法 A
navigate('/catalog/1', { state: { mode: 'stack', transition: 'cover' } })

// 写法 B — 布局组件
<AnimatedOutlet mode="stack" transition="cover" />
```

## Tab 用法

底栏 Tab 只需两件事：**菜单在 `<AnimatedOutlet>` 外**，**内容区加 `mode="switch"`**。默认即时切换（`none`），不卡顿；要动画再写 `transition="fade"` 或 `"slide"`。

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
        <AnimatedOutlet mode="switch" />
      </main>
      <nav className="flex border-t">
        <NavLink to="/tabs/home" replace>首页</NavLink>
        <NavLink to="/tabs/profile" replace>我的</NavLink>
      </nav>
    </div>
  )
}
```

要点：`nav` 与 `<AnimatedOutlet mode="switch">` **同级**；菜单不参与转场。

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
navigate('/tabs/profile', { replace: true, state: { mode: 'switch', transition: 'fade' } })
```

**写法 B** — 组件上声明：

```tsx
<AnimatedOutlet mode="switch" transition="fade" />
// 或 slide
<AnimatedOutlet mode="switch" transition="slide" />
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

Tab 滑动动画（`keepAlive mode="switch" transition="slide"`）额外支持 `--fr-ease-tab` 专属缓动变量：

```css
:root {
  /* tab 切换缓动（默认 cubic-bezier(0.4, 0, 0.2, 1)，Material Design 标准）
     快速启动、平滑减速，比全局 --fr-ease 更适合横向 tab 滑动 */
  --fr-ease-tab: cubic-bezier(0.4, 0, 0.2, 1);

  /* 改成弹簧感更强的效果示例 */
  /* --fr-ease-tab: cubic-bezier(0.22, 1, 0.36, 1); */
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

`keepAlive` 底层使用 React 19.2 官方 [`<Activity>`](https://react.dev/reference/react/Activity) 原语实现，无第三方依赖。切换页面**不会 remount** 组件，state、DOM（含滚动位置）、已加载数据完整保留。

#### 栈模式（`keepAlive`，`mode` 默认 `stack`）

适用于列表 → 详情这类需要保留背景页状态的导航：

```tsx
<AnimatedOutlet keepAlive />
<AnimatedOutlet keepAlive transition="cover" />
```

前进（PUSH）时背景页保活在 DOM 中；返回（POP）时前景页以动画退出，背景页精确恢复。

#### Switch 模式（`keepAlive mode="switch"`）

适用于底部导航栏、多标签页等场景：

```tsx
<AnimatedOutlet keepAlive mode="switch" />
<AnimatedOutlet keepAlive mode="switch" transition="slide" />
```

所有访问过的页面按 pathname 缓存，切换时即时显示/隐藏。

#### 缓存失效机制（仅 switch 模式）

Switch 模式提供三种互补的缓存管理方式：

**`max`：LRU 内存上限**

```tsx
<AnimatedOutlet keepAlive mode="switch" max={10} />
```

超过 `max` 时按 LRU 自动淘汰最老的缓存。不传 `max` 时不限制（固定数量的 Tab 栏天然有界，无需设置）。

**`include`：允许缓存的路由白名单**

只有匹配的路由才会保留在缓存中；不匹配的页面在离开时会被销毁，下次进入重新 mount：

```tsx
// 精确匹配路径列表
<AnimatedOutlet keepAlive mode="switch" include={['/home', '/profile', '/settings']} />

// 正则匹配
<AnimatedOutlet keepAlive mode="switch" include={/^\/tabs\//} />

// 自定义函数
<AnimatedOutlet keepAlive mode="switch" include={(path) => !path.startsWith('/form')} />
```

**`exclude`：不缓存的路由黑名单**

匹配的路由在离开时立即清除，其他路由正常缓存：

```tsx
// 一次性页面（表单、确认页等）不缓存
<AnimatedOutlet keepAlive mode="switch" exclude={['/checkout', '/payment']} />

// 正则匹配
<AnimatedOutlet keepAlive mode="switch" exclude={/\/form\//} />

// 自定义函数
<AnimatedOutlet keepAlive mode="switch" exclude={(path) => path.startsWith('/wizard')} />
```

`include` 与 `exclude` 可同时使用：先过 `include` 白名单，再过 `exclude` 黑名单。

#### `aliveRef`：命令式缓存控制（仅 switch 模式）

需要主动清除缓存（如登出、刷新某页）时使用：

```tsx
import { useRef } from 'react'
import type { KeepAliveRef } from 'react-router-dom-animate'
import { AnimatedOutlet } from 'react-router-dom-animate'

function Layout() {
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  return (
    <>
      <button onClick={() => aliveRef.current?.remove('/profile')}>清除个人页缓存</button>
      <button onClick={() => aliveRef.current?.removeAll()}>登出 — 清除所有缓存</button>
      <AnimatedOutlet keepAlive mode="switch" aliveRef={aliveRef} />
    </>
  )
}
```

| 方法 | 说明 |
|------|------|
| `remove(pathname)` | 移除指定 pathname 的缓存，下次访问重新 mount |
| `removeAll()` | 移除所有非当前活跃页的缓存 |
| `getCached()` | 返回当前缓存的所有 pathname 列表 |

#### 从路由 `handle` 读取配置

无需给每个 `AnimatedOutlet` 手动传 prop，可在路由 `handle` 中统一声明：

```ts
// routes.tsx
{
  path: 'home',
  handle: { keepAlive: true, transition: 'cover' },
  element: <HomeLayout />,  // 内部 AnimatedOutlet 无需任何 prop
}
// 底部 Tab 场景
{
  path: 'tabs',
  handle: { keepAlive: true, mode: 'switch', transition: 'fade' },
  element: <TabsLayout />,
}
```

prop 的优先级高于 handle，二者可混用。

#### 与 Vue `keepAlive` 的差异

| 行为 | Vue `keepAlive` | React `<Activity>` |
|------|-----------------|---------------------|
| 组件状态（state） | ✅ 保留 | ✅ 保留 |
| DOM / scrollTop | ✅ 保留 | ✅ 保留（含手动 scroll 存取） |
| `useEffect` | ⏸ 暂停，不清理 | 🔄 隐藏时清理，显示时重跑 |
| `onActivated` | 专属生命周期 | `useActivated` |
| `onDeactivated` | 专属生命周期 | `useDeactivated` |
| video / audio / iframe | ✅ 不受影响 | ⚠️ 隐藏时暂停或重载（见下） |

> **`useEffect` 的实际影响**：轮询、WebSocket 等副作用切走时自动清理，切回时重新建立——通常是更安全的行为。
>
> **video / audio / iframe 注意**：`<Activity>` 通过 `display:none` 隐藏页面，浏览器会暂停 `<video>`/`<audio>` 播放，`<iframe>` 可能触发重新加载。这是浏览器的底层行为，无法通过 JavaScript 绕过。如果页面包含媒体播放器或内嵌文档，请结合 `useDeactivated` 保存播放进度，在 `useActivated` 中恢复。

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

# react-router-dom-animate

为 [react-router-dom](https://reactrouter.com/) v7+ 提供栈式页面转场的轻量动画库，基于 React 19 [`<Activity>`](https://react.dev/reference/react/Activity)。

**安装**

```bash
npm install react-router-dom-animate
```

> Peer deps：`react` ≥19、`react-dom` ≥19、`react-router-dom` ≥7

---

## 入门教程

### 第一步：替换根路由的 Outlet

打开你的路由文件，找到根 `layout` 组件（一般含 `<Outlet />`），改成 `<AnimatedOutlet />`：

```tsx
// layout.tsx（或 root.tsx）
import { AnimatedOutlet } from 'react-router-dom-animate'

export function RootLayout() {
  return (
    <div>
      {/* 头部、侧边栏等保持不变 */}
      <AnimatedOutlet />  {/* ← 只改这一行 */}
    </div>
  )
}
```

完成。所有子页面现在都有默认的 `cover`（覆盖滑入）动画。

### 第二步：指定动画类型

**最简单的方式** — 在对应页面的路由上声明：

```tsx
// routes.tsx
{
  path: 'detail/:id',
  element: (
    <AnimatedOutlet transition="cover">  {/* ← 给 detail 指定 cover 动画 */}
      <DetailPage />
    </AnimatedOutlet>
  ),
}
```

**或者在跳转时临时指定**（不想改路由时用这个）：

```tsx
navigate('/detail/1', { state: { transition: 'cover' } })
```

两种方式效果完全相同，后退 `navigate(-1)` 不需要再传参，自动播放反向动画。

### 第三步：选择动画类型

| 动画 | 效果 |
|------|------|
| `cover` | 新页从右侧滑入覆盖，返回时收回（iOS 风格），**默认** |
| `slide` | 新旧页面同向对滑（Android 风格） |
| `fade` | 淡入淡出 |
| `scale` | 缩放进入 |
| `modal` | 从底部弹出（适合半页弹层） |
| `none` | 无动画，即时切换 |

---

## Props 完整说明

### `<AnimatedOutlet>`

```tsx
<AnimatedOutlet
  transition="cover"   // 动画类型，见上表
  mode="stack"         // stack（默认）| switch（仅非 keepAlive 场景使用）
  className={undefined}// 附加 class，作用在外层容器上
/>
```

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `transition` | `string` | `'cover'` | 内置：`cover` `slide` `fade` `scale` `modal` `none`；也可用自定义预设名称 |
| `mode` | `'stack' \| 'switch'` | `'stack'` | 无 keepAlive 时：`stack` 有方向感，`switch` 平级无方向。**在 `<KeepAlive>` 内部时此 prop 被忽略** |
| `className` | `string` | — | 附加到外层 `.animated-outlet-group` 上的 class |

### `<KeepAlive>`

用于启用页面保活。将需要缓存的 `<AnimatedOutlet>` 包裹在 `<KeepAlive>` 内：

```tsx
<KeepAlive
  mode="stack"        // stack（默认，列表→详情）| switch（Tab 缓存）
  max={30}            // 最大缓存页数，仅 switch 模式，超出按 LRU 淘汰
  include={undefined} // 缓存白名单，仅 switch 模式
  exclude={undefined} // 缓存黑名单，仅 switch 模式
  aliveRef={undefined}// 命令式缓存控制句柄，仅 switch 模式
>
  <AnimatedOutlet />
</KeepAlive>
```

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | `'stack' \| 'switch'` | `'stack'` | `stack`：栈式压入详情；`switch`：Tab 缓存 |
| `max` | `number` | `30` | 最多缓存多少页，超出按 LRU 淘汰（仅 switch 模式）|
| `include` | `string[] \| RegExp \| (path) => boolean` | — | 缓存白名单，只有匹配的页面才缓存（仅 switch 模式）|
| `exclude` | `string[] \| RegExp \| (path) => boolean` | — | 缓存黑名单，匹配的页面离开时立即销毁（仅 switch 模式）|
| `aliveRef` | `RefObject<KeepAliveRef>` | — | 命令式缓存控制句柄（仅 switch 模式）|

> **也可通过路由 `handle` 自动触发**（不使用 `<KeepAlive>` 时的备用方式，仅支持栈模式）：
>
> ```ts
> { path: 'detail', handle: { transition: 'cover', keepAlive: true }, element: <Layout /> }
> ```

---

## Tab 导航

Tab 导航分三个层次，按需选择：

| 场景 | 用法 | 特点 |
|------|------|------|
| 即时切换，无动画 | `<AnimatedOutlet mode="switch" />` | 最简单 |
| 切换有动画，但不保留状态 | `<AnimatedOutlet mode="switch" transition="slide" />` | 有动画感 |
| **切换保留状态（推荐）** | `<KeepAlive mode="switch">` 包裹 | 状态/滚动位置完整保留 |

### 第一步：路由配置（三种用法通用）

```tsx
// routes.tsx
{
  path: 'tabs',
  element: <TabsLayout />,
  children: [
    { path: 'home',     handle: { tabIndex: 0 }, element: <HomeTab /> },
    { path: 'discover', handle: { tabIndex: 1 }, element: <DiscoverTab /> },
    { path: 'profile',  handle: { tabIndex: 2 }, element: <ProfileTab /> },
  ],
}
```

> `tabIndex` 用于 `slide` / `cover` 动画方向判断（tabIndex 小 → 大 = 向右滑入）。不配置时动画无方向感，自动降级为 `fade`。

### 第二步：TabsLayout 组件

根据需求选择下面三种写法之一：

```tsx
// TabsLayout.tsx
import { NavLink } from 'react-router-dom'
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'

export function TabsLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ① 内容区：选择下面三种之一 */}
      <main style={{ flex: 1, overflow: 'hidden' }}>

        {/* 方案 A：无动画，即时切换 */}
        <AnimatedOutlet mode="switch" />

        {/* 方案 B：有切换动画，但每次切回来都重新渲染（状态不保留） */}
        <AnimatedOutlet mode="switch" transition="slide" />

        {/* 方案 C：有切换动画 + 保留状态（推荐）
            切走的 Tab 保留在内存中，state / 滚动位置完整保留，切回来零成本恢复 */}
        <KeepAlive mode="switch">
          <AnimatedOutlet transition="slide" />
        </KeepAlive>

      </main>

      {/* ② 底部 Tab 栏：与内容区同级，不参与页面转场动画 */}
      <nav style={{ display: 'flex', borderTop: '1px solid #eee' }}>
        <NavLink to="/tabs/home"     replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>首页</NavLink>
        <NavLink to="/tabs/discover" replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>发现</NavLink>
        <NavLink to="/tabs/profile"  replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>我的</NavLink>
      </nav>

    </div>
  )
}
```

> **关键**：底部 Tab 栏（`<nav>`）和内容区（`<main>`）是**同级**关系，Tab 栏不会参与页面转场。

### 支持的动画类型（Tab 模式）

| 动画 | 效果 | 需要 `tabIndex` |
|------|------|----------------|
| 不设置 | 无动画，即时切换 | 否 |
| `fade` | 淡入淡出 | 否 |
| `slide` | 左右方向滑动 | **是** |
| `cover` | iOS 风格覆盖，带方向感 | **是** |
| `scale` | 缩放进入 | 否 |

### 进阶：保活 + 精确控制哪些 Tab 缓存

```tsx
// 只缓存 3 个主 Tab，其他临时页面（如弹出支付页）离开即销毁
<KeepAlive mode="switch" include={['/tabs/home', '/tabs/discover', '/tabs/profile']}>
  <AnimatedOutlet transition="slide" />
</KeepAlive>

// 或者用排除方式（黑名单），指定不缓存的页面
<KeepAlive mode="switch" exclude={['/tabs/payment', '/tabs/form']}>
  <AnimatedOutlet transition="slide" />
</KeepAlive>
```

---

## keepAlive 页面保活

切换页面时**不会 remount**，state / DOM / 滚动位置完整保留。底层基于 React 19 官方 `<Activity>`，无第三方依赖。

用 `<KeepAlive>` 包裹需要缓存的 `<AnimatedOutlet>`，直观地表达"这里需要保活"：

```tsx
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'
```

### 栈模式（列表 → 详情）

适合列表页 → 详情页 → 返回列表页这类场景：

```tsx
// ListLayout.tsx
<KeepAlive>
  <AnimatedOutlet transition="cover" />
</KeepAlive>
```

前进（PUSH）时背景页留在 DOM；返回（POP）时前景页退出，背景页精确恢复（包括滚动位置）。

### Switch 模式（Tab 缓存）

适合底部导航栏、多标签页：

```tsx
// TabsLayout.tsx
<KeepAlive mode="switch">
  <AnimatedOutlet />
</KeepAlive>

// 带动画
<KeepAlive mode="switch">
  <AnimatedOutlet transition="slide" />
</KeepAlive>
```

所有访问过的页面按 pathname 缓存，切换时即时显示/隐藏，滚动位置自动保存恢复。

**控制缓存大小（LRU）：**

```tsx
<KeepAlive mode="switch" max={10}>
  <AnimatedOutlet />
</KeepAlive>
```

超出 `max` 时自动淘汰最近最少使用的页面。默认值 30 覆盖绝大多数 App 的 Tab 场景。

**白名单 / 黑名单：**

```tsx
// 只缓存这 3 个 Tab，其他页面离开即销毁
<KeepAlive mode="switch" include={['/home', '/profile', '/settings']}>
  <AnimatedOutlet />
</KeepAlive>

// 表单类页面不缓存（离开即销毁，避免数据残留）
<KeepAlive mode="switch" exclude={['/checkout', '/payment']}>
  <AnimatedOutlet />
</KeepAlive>

// 正则或自定义函数也可以
<KeepAlive mode="switch" exclude={(path) => path.startsWith('/form')}>
  <AnimatedOutlet />
</KeepAlive>
```

`include` 与 `exclude` 可同时使用，先过白名单再过黑名单。

### 命令式清除缓存（aliveRef）

需要主动清除缓存时使用，比如用户登出：

```tsx
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'
import type { KeepAliveRef } from 'react-router-dom-animate'

function TabsLayout() {
  const navigate = useNavigate()
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  const handleLogout = () => {
    aliveRef.current?.removeAll()  // 清除所有非当前页缓存
    navigate('/login')
  }

  return (
    <>
      <KeepAlive mode="switch" aliveRef={aliveRef}>
        <AnimatedOutlet />
      </KeepAlive>
      <button onClick={handleLogout}>登出</button>
    </>
  )
}
```

| 方法 | 说明 |
|------|------|
| `remove(pathname)` | 移除指定 pathname 的缓存，下次访问重新 mount |
| `removeAll()` | 移除所有非当前活跃页的缓存，当前页不受影响 |
| `getCached()` | 返回当前缓存的所有 pathname（LRU 顺序，末尾为最近访问） |

**调试技巧 — 实时显示缓存列表（订阅路由自动刷新）：**

```tsx
function CachedBadge({ aliveRef }: { aliveRef: React.RefObject<KeepAliveRef | undefined> }) {
  useLocation() // 每次路由切换触发重渲染
  const cached = aliveRef.current?.getCached() ?? []
  return <div>当前缓存: {cached.join(', ') || '(空)'}</div>
}
```

> **性能提示**：`include` / `exclude` 如果传内联函数，父组件每次重渲染都会生成新的函数引用，
> 导致 `KeepAlive` Context 重建，进而让 `AnimatedOutlet` 重渲染。
> 推荐用 `useCallback` 或模块级常量保持引用稳定：
>
> ```tsx
> // ✅ 推荐：稳定引用
> const isPaymentPage = useCallback((p: string) => p.startsWith('/payment'), [])
> <KeepAlive mode="switch" exclude={isPaymentPage}>
>
> // ⚠️ 避免：每次 render 新引用
> <KeepAlive mode="switch" exclude={(p) => p.startsWith('/payment')}>
> ```

### 生命周期钩子

`keepAlive` 模式下组件不 remount，用这两个 hook 监听页面进出：

```tsx
import { useActivated, useDeactivated } from 'react-router-dom-animate'

function ProfilePage() {
  useActivated(() => {
    // 每次页面变为活跃时执行，含首次 mount
    fetchLatestData()
  })

  useDeactivated(() => {
    // 页面离开（隐藏或卸载）时执行
    cancelPendingRequests()
  })
}
```

| | keepAlive 模式 | 不用 keepAlive |
|--|--------------|--------------|
| `useActivated` | 每次页面变为活跃时触发（含首次 mount） | 等价于 `useEffect(() => cb(), [])` |
| `useDeactivated` | 页面隐藏 / 整组卸载时触发 | 等价于 `useEffect(() => () => cb(), [])` |

> **注意**：`<Activity>` 通过 `display:none` 隐藏页面。`<video>`/`<audio>` 会暂停，`<iframe>` 可能重载。如有媒体播放器，可在 `useDeactivated` 中保存进度，在 `useActivated` 中恢复。

---

## 自定义动画时长

### 用 CSS 变量（推荐）

```css
:root {
  --fr-duration: 300ms;        /* 全局时长（默认 300ms） */
  --fr-duration-modal: 450ms;  /* 单独覆盖某种动画 */
  --fr-duration-slide: 280ms;
}
```

支持的变量名：`--fr-duration-cover` `--fr-duration-slide` `--fr-duration-fade` `--fr-duration-scale` `--fr-duration-modal`

### 用 JS

```ts
import { setAnimDuration } from 'react-router-dom-animate'

setAnimDuration('modal', 450)  // 优先级高于 CSS 变量
```

### 注册自定义动画

```ts
import { registerAnimPreset } from 'react-router-dom-animate'

registerAnimPreset({
  type: 'my-flip',
  forward: {
    enter: 'flip-enter',
    enterActive: 'flip-enter-active',
    exit: 'flip-exit',
    exitActive: 'flip-exit-active',
  },
  back: {
    enter: 'flip-back-enter',
    enterActive: 'flip-back-enter-active',
    exit: 'flip-back-exit',
    exitActive: 'flip-back-exit-active',
  },
  durationMs: 600,
})

// 注册后和内置动画用法完全一致
<AnimatedOutlet transition="my-flip" />
navigate('/page', { state: { transition: 'my-flip' } })
```

---

## Demo

```bash
npm run demo   # http://localhost:5180
```

MIT

# react-router-dom-animate

为 [react-router-dom](https://reactrouter.com/) v7 提供路由转场与页面缓存，基于 React 19.2 [`<Activity>`](https://react.dev/reference/react/Activity)。

```bash
npm install react-router-dom-animate
```

**要求**：React 19.2+、React Router 7、`createBrowserRouter` + `<RouterProvider>`（Data Router）。**仅浏览器端**，不支持 SSR — Next.js / Remix 请将相关组件标记 `'use client'`。

---

## 在线示例

- StackBlitz（仅加载 `demo/stackblitz` 示例目录）：[Open Demo](https://stackblitz.com/github/ws18250840411/react-router-dom-animate/tree/master/demo/stackblitz)
- 示例使用 npm 包 `react-router-dom-animate`，不会引用仓库内 `src` 源码。
- 可直接体验：全局转场切换、列表→详情（stack）、KeepAlive Tabs 状态保留、页面激活/离开日志。

---

## 快速上手

把根 Layout 的 `<Outlet />` 换成 `<AnimatedOutlet />`，默认即有 iOS 风格 `cover` 转场：

```tsx
import { AnimatedOutlet } from 'react-router-dom-animate'

export function RootLayout() {
  return <AnimatedOutlet />
}
```

指定动画：路由 `handle` 或跳转时传 `state` 均可，`navigate(-1)` 自动反向：

```tsx
{ path: 'detail/:id', handle: { transition: 'slide' }, element: <DetailPage /> }
navigate('/detail/1', { state: { transition: 'modal' } })
```

| 动画 | 效果 |
|------|------|
| `cover` | 右滑覆盖（**默认**） |
| `slide` | 同向对滑 |
| `fade` / `scale` / `modal` / `none` | 淡入淡出 / 缩放 / 底部弹出 / 无动画 |

---

## 常见场景

### 列表 → 详情（保留状态 + 滚动位置）

```tsx
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'

<KeepAlive>
  <AnimatedOutlet transition="cover" />
</KeepAlive>
```

PUSH 时背景页留在 DOM，POP 时完整恢复。stack 模式按返回栈管理，不需要 `max`。

### 底部 Tab（切换保留状态）

Tab 栏与 `<AnimatedOutlet />` **同级**，不参与转场：

```tsx
export function TabsLayout() {
  return (
    <>
      <KeepAlive mode="switch">
        <AnimatedOutlet transition="slide" />
      </KeepAlive>
      <nav>{/* Tab 按钮 */}</nav>
    </>
  )
}
```

路由加 `tabIndex` 可让 `slide` / `cover` 有方向感（小 → 大 = 向右）：

```tsx
{ path: 'home', handle: { tabIndex: 0 }, element: <HomeTab /> }
```

| 需求 | 写法 |
|------|------|
| 无动画即时切换 | `<AnimatedOutlet mode="switch" />` |
| 有动画但不缓存 | `<AnimatedOutlet mode="switch" transition="slide" />` |
| 有动画 + 保留状态 | `<KeepAlive mode="switch"><AnimatedOutlet transition="slide" /></KeepAlive>` |

### 根 Layout 统一缓存策略

根层 stack 保活 + 菜单层 switch 即时切换，是移动端 App 的推荐组合：

```tsx
// 根 Layout — 一次声明
<KeepAlive include={['HomeTab', 'DiscoverTab', 'ProfileTab']}>
  <AnimatedOutlet />
</KeepAlive>

// 路由 handle — 给需要缓存的页面命名
export const handle = { keepAliveName: 'HomeTab', tabIndex: 0 }

// Tab Layout — 只覆盖导航模式，不继承根层 cover 动画
<AnimatedOutlet mode="switch" />
```

也可在路由 `handle` 中启用栈模式缓存，无需 `<KeepAlive>` 包裹：`handle: { keepAlive: true }`。

---

## API 速查

### `<AnimatedOutlet>`

| Prop | 默认 | 说明 |
|------|------|------|
| `transition` | `'cover'` | 内置或自定义预设名 |
| `mode` | `'stack'` | `stack` 有方向感；`switch` 平级切换。在 `<KeepAlive>` 内继承其 mode |
| `className` | — | 外层容器 class |
| `onTransitionStart` | - | 转场开始时触发（含即时切换）。可用于显示 loading、埋点 |
| `onTransitionEnd` | - | 转场完成时触发（settled location 已提交）。与 `onTransitionStart` 配对 |

### `<KeepAlive>`

| Prop | 默认 | 说明 |
|------|------|------|
| `mode` | `'stack'` | `stack` 列表→详情；`switch` Tab 缓存 |
| `max` | `30`(switch) / `10`(stack) | switch: LRU 上限；stack: 返回栈深度上限，超出时从底部驱逐最旧页面 |
| `include` / `exclude` | — | 白/黑名单，匹配 pathname 或 `keepAliveName`（仅 switch） |
| `aliveRef` | - | 命令式控制缓存（两种模式均支持） |

`aliveRef` 方法（stack 和 switch 通用）：

```ts
aliveRef.current?.remove('/list')    // 移除指定 pathname 的缓存页面
aliveRef.current?.removeAll()        // 移除所有非活跃缓存页面
aliveRef.current?.getCached()        // 获取当前缓存的 pathname 列表
```


> 运行时切换 `mode` 会清空所有缓存。`include` / `exclude` / `max` 内部用 ref 存储，内联函数不会触发 Context 重建。

### 生命周期

keepAlive 模式下组件不 remount，用 hook 感知页面显隐：

```tsx
useActivated(() => fetchData())    // 页面变为活跃（含首次 mount）
useDeactivated(() => cleanup())    // 页面隐藏或卸载
```

> `<Activity>` 用 `display:none` 隐藏页面，`<video>`/`<audio>` 会暂停。

---

## 自定义动画

**CSS 变量**（推荐）：`--fr-duration`（全局）、`--fr-duration-cover` 等（按类型）。

**JS**：`setAnimDuration('modal', 450)` — 优先级高于 CSS。

**注册预设**：

```ts
import { registerAnimPreset, unregisterAnimPreset } from 'react-router-dom-animate'

registerAnimPreset({ type: 'my-flip', forward: { ... }, back: { ... }, durationMs: 600 })
<AnimatedOutlet transition="my-flip" />

unregisterAnimPreset('my-flip')  // HMR 场景移除
```

系统启用"减少动态效果"时自动 0ms 转场。

### CSS 变量速查

| 变量 | 默认 | 说明 |
|------|------|------|
| `--fr-duration` | `300ms` | 全局动画时长 |
| `--fr-duration-{type}` | - | 按类型覆盖，如 `--fr-duration-modal: 450ms` |
| `--fr-ease` | `cubic-bezier(.25,.46,.45,.94)` | 默认缓动 |
| `--fr-ease-spring` | `cubic-bezier(.32,.72,0,1)` | 弹性缓动（modal/slide-up） |
| `--fr-ease-tab` | `cubic-bezier(.4,0,.2,1)` | Tab 切换缓动 |
| `--fr-page-bg` | `#f9fafb` | 页面背景色（浅色） |
| `--fr-page-bg-dark` | `#030712` | 页面背景色（深色） |
| `--fr-modal-overlay` | `rgba(15,23,42,.55)` | modal 遮罩色 |
| `--fr-pending-bg` | `rgba(255,255,255,.4)` | loader loading 时的 overlay 色 |

### 路由 Loading 状态

当 React Router 7 的路由 loader 正在加载时，容器自动添加 `data-pending` 属性，CSS 显示半透明 overlay 防止白屏闪烁：

```css
/* 自定义 overlay 效果 */
.animated-outlet-group[data-pending]::after {
  background: url('/spinner.svg') center / 24px no-repeat;
}
```

也可通过 `--fr-pending-bg` 变量只改颜色：

```css
:root { --fr-pending-bg: rgba(0, 0, 0, 0.3); }
```

### 动画事件回调

```tsx
<AnimatedOutlet
  onTransitionStart={() => NProgress.start()}
  onTransitionEnd={() => NProgress.done()}
/>
```

> 即时切换（`duration=0` 或 `prefers-reduced-motion`）也会触发回调，`start` 和 `end` 之间可能无延迟。

---

## Demo

```bash
npm run demo   # http://localhost:5180
```

完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)。MIT

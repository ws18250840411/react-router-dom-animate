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

```tsx
<AnimatedOutlet
  transition="cover"         // 动画类型，见上表
  mode="stack"               // stack（默认）| switch
  keepAlive={false}          // 是否保活页面
  max={undefined}            // 最大缓存页数（仅 keepAlive + switch 模式）
  include={undefined}        // 缓存白名单（仅 keepAlive + switch 模式）
  exclude={undefined}        // 缓存黑名单（仅 keepAlive + switch 模式）
  aliveRef={undefined}       // 命令式缓存控制（仅 keepAlive + switch 模式）
  className={undefined}      // 附加 class，作用在外层容器上
/>
```

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `transition` | `string` | `'cover'` | 内置：`cover` `slide` `fade` `scale` `modal` `none`；也可用自定义预设名称 |
| `mode` | `'stack' \| 'switch'` | `'stack'` | `stack`：栈式压入详情；`switch`：平级切换（Tab）|
| `keepAlive` | `boolean` | `false` | 保活页面。栈模式保留背景页，Switch 模式缓存所有访问页 |
| `max` | `number` | 无限制 | 最多缓存多少页，超出按 LRU 淘汰（仅 switch 模式）|
| `include` | `string[] \| RegExp \| (path) => boolean` | — | 缓存白名单，只有匹配的页面才缓存（仅 switch 模式）|
| `exclude` | `string[] \| RegExp \| (path) => boolean` | — | 缓存黑名单，匹配的页面离开时立即销毁（仅 switch 模式）|
| `aliveRef` | `RefObject<KeepAliveRef>` | — | 命令式缓存控制句柄（仅 switch 模式）|
| `className` | `string` | — | 附加到外层 `.animated-outlet-group` 上的 class |

> **也可通过路由 `handle` 配置**（省去给每个 `AnimatedOutlet` 手写 prop）：
>
> ```ts
> { path: 'detail', handle: { transition: 'cover', keepAlive: true }, element: <Layout /> }
> ```

---

## Tab 导航

### 基础 Tab（无动画，即时切换）

```tsx
// routes.tsx
{
  path: 'tabs',
  element: <TabsLayout />,
  children: [
    { path: 'home',    element: <HomeTab /> },
    { path: 'profile', element: <ProfileTab /> },
  ],
}
```

```tsx
// TabsLayout.tsx
import { NavLink } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

export function TabsLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 内容区 */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        <AnimatedOutlet mode="switch" />
      </main>
      {/* 底部 Tab 栏放在 AnimatedOutlet 外面 */}
      <nav style={{ display: 'flex', borderTop: '1px solid #eee' }}>
        <NavLink to="/tabs/home"    replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>首页</NavLink>
        <NavLink to="/tabs/profile" replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>我的</NavLink>
      </nav>
    </div>
  )
}
```

> **要点**：`nav` 和 `<AnimatedOutlet>` 是同级关系，底部菜单不参与转场。

### 带动画的 Tab

```tsx
<AnimatedOutlet mode="switch" transition="fade" />   {/* 淡入淡出 */}
<AnimatedOutlet mode="switch" transition="slide" />  {/* 左右滑动 */}
```

使用 `slide` 时**需要**在每个 Tab 子路由的 `handle` 中声明 `tabIndex`，否则无法判断方向，自动降级为 `fade`：

```tsx
{ path: 'home',    handle: { tabIndex: 0 }, element: <HomeTab /> }
{ path: 'profile', handle: { tabIndex: 1 }, element: <ProfileTab /> }
```

---

## keepAlive 页面保活

切换页面时**不会 remount**，state / DOM / 滚动位置完整保留。底层基于 React 19 官方 `<Activity>`，无第三方依赖。

### 栈模式（列表 → 详情）

适合列表页 → 详情页 → 返回列表页这类场景：

```tsx
<AnimatedOutlet keepAlive />
<AnimatedOutlet keepAlive transition="cover" />
```

前进（PUSH）时背景页留在 DOM；返回（POP）时前景页退出，背景页精确恢复（包括滚动位置）。

### Switch 模式（Tab 缓存）

适合底部导航栏、多标签页：

```tsx
<AnimatedOutlet keepAlive mode="switch" />
<AnimatedOutlet keepAlive mode="switch" transition="slide" />
```

所有访问过的页面按 pathname 缓存，切换时即时显示/隐藏，滚动位置自动保存恢复。

**控制缓存大小（LRU）：**

```tsx
<AnimatedOutlet keepAlive mode="switch" max={10} />
```

超出 `max` 时自动淘汰最近最少使用的页面。固定 Tab 栏天然有界，一般不需要设置。

**白名单 / 黑名单：**

```tsx
// 只缓存这 3 个 Tab，其他页面离开即销毁
<AnimatedOutlet keepAlive mode="switch" include={['/home', '/profile', '/settings']} />

// 表单类页面不缓存（离开即销毁，避免数据残留）
<AnimatedOutlet keepAlive mode="switch" exclude={['/checkout', '/payment']} />

// 正则或自定义函数也可以
<AnimatedOutlet keepAlive mode="switch" exclude={(path) => path.startsWith('/form')} />
```

`include` 与 `exclude` 可同时使用，先过白名单再过黑名单。

### 命令式清除缓存（aliveRef）

需要主动清除缓存时使用，比如用户登出：

```tsx
import { useRef } from 'react'
import { AnimatedOutlet } from 'react-router-dom-animate'
import type { KeepAliveRef } from 'react-router-dom-animate'

function TabsLayout() {
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  const handleLogout = () => {
    aliveRef.current?.removeAll()  // 清除所有缓存
    navigate('/login')
  }

  return (
    <>
      <AnimatedOutlet keepAlive mode="switch" aliveRef={aliveRef} />
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

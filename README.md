# react-router-dom-animate

为 [react-router-dom](https://reactrouter.com/) 提供栈式页面转场的轻量方案，基于 [react-transition-group](https://reactcommunity.org/react-transition-group/)。

## 特性

- 内置 CSS，引入 `AnimatedOutlet` 即自动生效
- 支持嵌套 `AnimatedOutlet`，不同区域可用不同动画
- 两种等效的配置方式，按习惯任选
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

// 1. 根路由挂上 AnimatedOutlet
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

## 设置动画

告诉库「这次换页用什么动画」，有 **两种方式**，**效果完全一样**，选一个用即可。

| | 方式一：跳转时指定 | 方式二：路由上指定 |
|--|-------------------|-------------------|
| 写在哪 | `navigate` / `Link` 的 `state` | 路由里的 `<AnimatedOutlet transition>` |
| 路由结构 | 页面直接作为子路由 | 用 `AnimatedOutlet` 包住页面 |
| 怎么跳 | `state: { transition: 'fade' }` | 普通 `navigate` / `Link` 即可 |

### 示例：两种方式效果相同

目标都是进入 `AboutPage` 时播放 **fade** 动画。

**方式一 — 跳转时带上 `state`**

```tsx
// routes.tsx
{ path: 'about', element: <AboutPage /> }

// 任意页面里
navigate('/about', { state: { transition: 'fade' } })
<Link to="/about" state={{ transition: 'fade' }}>关于</Link>
```

**方式二 — 路由上包一层 `AnimatedOutlet`**

```tsx
// routes.tsx
{
  path: 'about',
  element: (
    <AnimatedOutlet transition="fade">
      <AboutPage />
    </AnimatedOutlet>
  ),
}

// 任意页面里 — 写法与普通 RR 相同
navigate('/about')
<Link to="/about">关于</Link>
```

### 全局默认动画

如果大部分页面用同一种动画，在**根级** `AnimatedOutlet` 上配置即可，子页面跳转时不用每次写 `state`：

```tsx
// 全站默认 slide；单次跳转仍可用 state 临时改成 fade
{
  element: <AnimatedOutlet transition="slide" />,
  children: [
    { path: 'list', element: <ListPage /> },
    { path: 'detail', element: <DetailPage /> },
  ],
}
```

也可以给**单个路由**单独指定（会覆盖全局默认）：

```tsx
{
  element: <AnimatedOutlet transition="slide" />,  // 全局默认 slide
  children: [
    { path: 'list', element: <ListPage /> },
    {
      path: 'modal',
      element: (
        <AnimatedOutlet transition="modal">  {/* 仅 modal 路由用 modal 动画 */}
          <ModalPage />
        </AnimatedOutlet>
      ),
    },
  ],
}
```

**未配置任何 `transition` 时**，fallback 为 `cover`。可选值见「内置预设」。

**后退** `navigate(-1)` 无需再传 `state`，库会自动匹配退场动画。

### 嵌套布局（Tab 等场景）

进入 Tab 区域用外层动画（如 `cover`），Tab 之间切换用内层 `fade`。需要**路由 + 布局组件**配合：

```tsx
// routes.tsx — 注册 Tab 子路由，并挂上 TabsLayout
{
  path: 'tabs',
  element: <TabsLayout />,
  children: [
    { path: 'a', element: <TabA /> },
    { path: 'b', element: <TabB /> },
  ],
}
```

```tsx
// TabsLayout.tsx — 内层 AnimatedOutlet 只管 Tab 切换
import { NavLink } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

export function TabsLayout() {
  return (
    <div>
      <nav>
        <NavLink to="/tabs/a" replace>Tab A</NavLink>
        <NavLink to="/tabs/b" replace>Tab B</NavLink>
      </nav>
      <AnimatedOutlet transition="fade" />
    </div>
  )
}
```

外层根 `AnimatedOutlet` 负责「进入 / 离开 Tab 模块」；内层负责「A ↔ B 切换」。

## 内置预设

| 预设 | 效果 |
|------|------|
| `cover` | 新页右进覆盖旧页（**默认**） |
| `slide` | 新页右进，旧页左移留底 |
| `fade` | 交叉淡入淡出 |
| `scale` | 缩放进入 / 退出 |
| `modal` | 底部滑入 / 向下滑出 |
| `none` | 无动画 |

## 本地 Demo

```bash
npm run demo    # http://localhost:5180
```

Demo 中 `/push/*` 演示方式一（跳转带 `state`），`/wrap/*` 演示方式二（路由包 `AnimatedOutlet`），效果一一对应。

## API

| 导出 | 用途 |
|------|------|
| `AnimatedOutlet` | 转场出口组件（日常使用） |
| `AnimatedOutletProps` | 组件 props 类型 |
| `RouteAnimType` | `transition` 字段类型 |
| `registerAnimPreset` | 注册自定义动画预设（高级，可选） |
| `AnimPreset` | 配合 `registerAnimPreset` 的类型 |

## 开发与验证

```bash
npm run build   # 构建库
npm test        # 单元测试
npm run e2e     # Playwright 回归
```

MIT

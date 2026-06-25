# react-router-dom-animate

为 [react-router-dom](https://reactrouter.com/) 提供栈式页面转场动画的轻量库。基于 `react-transition-group`，实现参考 [unplugin-react-router-dom](https://github.com) 与同仓库 `anim.ts`。

> 每个核心机制的设计依据见 **[docs/DESIGN.md](./docs/DESIGN.md)**。

## 特性

- **内置 CSS** — `import { AnimatedOutlet } from 'react-router-dom-animate'` 时样式自动注入，无需单独 import CSS
- **可选独立 CSS** — 仅需样式文件时可 `import 'react-router-dom-animate/anim.css'`
- **嵌套 Outlet** — 根级默认动画，子级 `transition` 覆盖
- **编程式导航** — `navigate.push('/path', { transition: 'fade' })` via `history.state`
- **POP 回退** — 从离场页 `history.state.transition` 读动画类型
- **可扩展** — `registerAnimPreset({ type, forward, back })`
- **转场队列** — 动画 busy 窗口内 defer navigate（Vue Router 守卫同类语义）

## 安装

```bash
npm install react-router-dom-animate react-transition-group
```

**Peer dependencies:** `react` ≥18、`react-dom` ≥18、`react-router-dom` ≥7

## 快速开始

```tsx
import { AnimatedOutlet, useAnimatedNavigate } from 'react-router-dom-animate'

const router = createBrowserRouter([
  { element: <AnimatedOutlet />, children: [/* … */] },
])
```

```tsx
<AnimatedOutlet transition="fade" />
<AnimatedOutlet transition="modal">{children}</AnimatedOutlet>

const navigate = useAnimatedNavigate()
navigate.push('/detail', { transition: 'slide' })
```

> 连点导航请用 `useAnimatedNavigate`；原生 `useNavigate` / `<Link>` 不走队列。

## 内置动画

| 类型 | PUSH | POP | 说明 |
|------|------|-----|------|
| `cover` | 右进左遮 | 左出右显 | 默认 |
| `slide` | 右进左移 | 左进右出 | 底层页可见 |
| `fade` | 交叉淡入淡出 | 交叉淡入淡出 | Tab |
| `scale` | 放大进入 | 缩小退出 | |
| `modal` | 底部滑入 | 向下滑出 | |
| `none` | 无动画 | 无动画 | |

逻辑与 unplugin `getMode` + `buildClassNames` 等价，见 `src/transition.ts`。

## 动画解析优先级

```
state.transition  →  handle.transition  →  pageAnim  →  layoutScope  →  fallback
```

## 源码结构

```
src/
  transition.ts   预设 + classNamesFor + planTransition（unplugin anim 等价）
  outlet.tsx      TransitionGroup 渲染（unplugin outlet 等价 + location.key）
  navigate.ts     history.state 编程式导航
  navigate-queue.ts  转场 busy 窗口 defer
  anim.css          样式（与 unplugin ANIM_CSS 同构）
docs/
  DESIGN.md         每项实现的业界依据
```

## 开发与验证

```bash
npm run build          # 构建库
npm test               # 库单元测试
cd demo && npm install # 首次需安装 demo 依赖
npm run demo           # http://localhost:5180
npm run e2e            # demo 目录 Playwright 回归
```

MIT

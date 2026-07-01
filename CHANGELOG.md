# Changelog

All notable changes to `react-router-dom-animate` are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — 2026-07-01

### Breaking Changes

- **移除 `tabs` prop**：原 `<AnimatedOutlet tabs />` 改为 `<AnimatedOutlet mode="switch" />`。`tabs` 的所有语义完全由 `mode="switch"` 承载，API 更加正交。
  - 迁移：将所有 `<AnimatedOutlet tabs>` 替换为 `<AnimatedOutlet mode="switch">`，`<AnimatedOutlet keepAlive tabs>` 替换为 `<AnimatedOutlet keepAlive mode="switch">`。
  - 路由 `handle` 中的 `tabs: true` 改为 `mode: 'switch'`。

- **`keepAlive` 底层由 CSS `visibility` 方案升级为 React 19.2 官方 `<Activity>` 原语**。
  - `<Activity mode="hidden">` 会清理 Effect，页面再次激活时重新执行 Effect。
  - 组件**状态（useState）、DOM（含 scrollTop）** 仍完整保留。
  - ⚠️ **已知限制**：`<Activity>` 使用 `display:none`，浏览器会暂停 `<video>`/`<audio>` 播放，`<iframe>` 可能触发重新加载。

### New Features

#### 极简三 API 设计：`transition` · `mode` · `keepAlive`

每个 API 完全独立，任意组合均有效：

```tsx
// 只有动画
<AnimatedOutlet transition="cover" />

// 列表→详情保活（栈模式）
<AnimatedOutlet keepAlive />
<AnimatedOutlet keepAlive transition="cover" />

// 底部 Tab 保活（switch 模式）
<AnimatedOutlet keepAlive mode="switch" />
<AnimatedOutlet keepAlive mode="switch" transition="slide" />
```

- **栈模式**（`keepAlive` 默认）：PUSH 时保留背景页，POP 时精确恢复，适合列表→详情场景。
- **Switch 模式**（`keepAlive mode="switch"`）：按 pathname 缓存，切换即时，适合底部 Tab 导航。
- `max` / `aliveRef` 仅在 switch 模式下有效。

#### `max` — LRU 内存上限

```tsx
<AnimatedOutlet keepAlive max={10} />  // 最多缓存 10 个页面，超出按 LRU 淘汰
```

默认不限制（`max` 不传）；建议 Tabs 类应用传 `max={20}` 防止内存增长过快。

#### `aliveRef` — 命令式缓存控制 API

```tsx
import { useRef } from 'react'
import type { KeepAliveRef } from 'react-router-dom-animate'
import { AnimatedOutlet } from 'react-router-dom-animate'

function Layout() {
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)
  return (
    <>
      <button onClick={() => aliveRef.current?.remove('/some/path')}>清除指定页</button>
      <button onClick={() => aliveRef.current?.removeAll()}>清除所有（当前页除外）</button>
      <AnimatedOutlet keepAlive aliveRef={aliveRef} />
    </>
  )
}
```

| 方法 | 说明 |
|------|------|
| `remove(pathname)` | 移除指定 pathname 的缓存，下次访问重新 mount |
| `removeAll()` | 移除所有非当前活跃页的缓存 |
| `getCached()` | 获取当前缓存的所有 pathname 列表 |

#### Route Handle 自动读取 `keepAlive` 配置

在路由 `handle` 中声明 `keepAlive: true`，无需对 `AnimatedOutlet` 传 prop：

```ts
// vite-plugin-file-router / 手写路由均适用
{
  path: 'tabs',
  handle: { keepAlive: true, transition: 'fade', tabs: true },
  element: <TabsLayout />,
}
```

`AnimatedOutlet` 自动从 `useMatches()` 读取最近祖先路由的 `handle.keepAlive`（prop 优先于 handle）。

#### `useActivated` / `useDeactivated` — 页面进入与离开的生命周期 hooks

```tsx
import { useActivated, useDeactivated } from 'react-router-dom-animate'

useActivated(() => fetchData())   // 页面变为活跃时触发（含首次 mount）
useDeactivated(() => cleanup())   // 页面离开时触发（非 keepAlive 时 = unmount）
```

- `keepAlive` 模式下分别对应"切回来"和"切走"；
- 非 `keepAlive` 模式下等同 `useEffect(() => cb(), [])` 与 `useEffect(() => () => cb(), [])`，无需修改代码即可切换 `keepAlive` 模式。

---

### Bug Fixes

#### `outlet.tsx`

- **Bug 1 — PageScope / LayoutScopeRegistrar 副作用在渲染函数体内直接执行**  
  `registerPageAnim` / `registerLayoutScope` 原本在 render body 中调用，React StrictMode 双调用导致注册状态紊乱。  
  → 全部移入 `useLayoutEffect`，并在 cleanup 中正确注销。

- **Bug 2 — `commitSettled` 被双重调用**  
  `childFactory` 中用一层匿名函数包裹 `commitSettled` 导致 `onExited` 触发两次，动画结束后产生额外 re-render。  
  → 去掉冗余包装，直接将 `commitSettled` 作为 `onExited` 传递。

- **Bug 3 — `useMemo` 在每次渲染时因 `matches.map()` 新引用失效**  
  `fromSnap`/`toSnap` 每次 render 都重新执行 `matches.map()`，导致 `activePlan` useMemo 频繁重算。  
  → 改用 `useRef` 缓存快照，仅在 `location.key` 变化时重建 `toSnapRef`，`fromSnapRef` 仅在落定后更新。

#### `vitest.config.ts`

- **Bug 4 — `layout-route.test.tsx` 缺少 jsdom 环境声明**  
  → 在 `environmentMatchGlobs` 中补充显式配置，避免测试在 Node 环境运行。

---

### Design Fixes

#### `transition.ts`

- **REPLACE 动画范围扩展**  
  原代码仅允许 `fade/scale/cover/slide` 在 REPLACE 导航时播动画，自定义 preset 被静默忽略。  
  → 改为检查 preset 的 `forward.enterActive` 是否非空，任何自定义 preset 均可在 REPLACE 时触发动画。`modal` 和 `none` 仍保持无动画。

- **`tabIndex` 缺失时优雅降级**  
  tabs + slide 场景下若 `tabIndex` 未配置，原实现用 `charCodeAt` 回退导致方向错乱。  
  → `tabIndexFromSnapshot` 未找到时返回 `undefined`；`classNamesForTabs` 检测到 undefined 后降级为 `FADE_FORWARD`。

- **`modal` preset 注册数据与行为对齐**  
  注册表中 `modal.forward` 原指向 `COVER_FORWARD`，与实际渲染路径（`MODAL_PUSH`）不符，影响 `animPresetRegistry` 的内省可靠性。  
  → 改为注册 `MODAL_PUSH`/`MODAL_POP`，并加注释说明 `classNamesFor` 的硬编码分支仍优先。

- **per-preset `durationMs` 支持**  
  新增 `AnimPreset.durationMs` 可选字段；`planTransition` 优先读取当前动画 preset 的 `durationMs`，回退到全局 `--fr-duration`。

- **`layoutRouteId` 分支补充注释**  
  `!leafPath.startsWith('/')` 分支处理 React Router v7 nested route 中叶路由 `UIMatch.pathname` 为相对路径的场景，补充注释说明意图，避免后续误判为死代码。

- **`sameLayoutPage` — 内联函数提取**  
  将 `sameLayoutPage` 内部每次调用都重新分配的匿名 `depth` 函数提取为模块级 `pathDepth`，避免不必要的函数分配。

- **SSR 注意事项文档**  
  为 `pageAnims`/`layoutScopes` 模块级 Map 添加 JSDoc，说明 SSR 多请求场景下的单例泄漏风险及规避方案。

- **`warmDurationMs` 竞态文档**  
  说明外部 CSS `<link>` 加载晚于 JS bundle 时 `--fr-duration` 读取为空的竞态问题及解决方式。

#### `outlet.tsx`

- **`AnimatedOutlet` 重复分支合并**  
  `depth === 0` 与 `depth > 0` 两个 JSX 分支逻辑完全等价（`depth + 1` 在 `depth === 0` 时恰为 `1`），合并为单一返回路径，提升可读性。

- **`UNSAFE_LocationContext` 风险文档**  
  为 `FrozenOutlet` 添加详细 JSDoc，说明该内部 API 的稳定性风险及版本升级注意事项。

- **`snap` 函数微优化**  
  移除 `matches.map((m) => ({ ...m, handle: m.handle }))` 中冗余的 `handle: m.handle`，简化为 `{ ...m }`。

- **使用 `IDLE` 常量**  
  `useMemo` 中的 `sameLayoutPage` 短路条件直接返回已导出的 `IDLE` 常量，避免每次创建同值对象。

---

### Performance

#### `anim.css`

- **WebView GPU 冷启动预热**  
  `.animated-outlet-page` 添加 `transform: translateZ(0)`（含 `-webkit-` 前缀），使页面在 mount 时即提升为 GPU 合成层，消除 iOS WKWebView / Android WebView 首次动画的冷启动延迟。

- **paint 包含边界**  
  `.animated-outlet-group` 添加 `contain: paint`，限制浏览器绘制边界，提升合成性能。

- **`will-change` 补全 opacity**  
  `.fr-animating` 的 `will-change` 从 `transform` 扩展为 `transform, opacity`，覆盖 fade / scale 动画的 GPU 提示。

- **`translate3d(0,0,0)` 强制 GPU 合成**  
  `fr-scale-enter`、`fr-scale-leave`、`fr-modal-bg-leave` 关键帧的 `from`/`to` 补充 `translate3d(0, 0, 0)`，确保这些动画触发硬件加速。

- **`@media (prefers-color-scheme: dark)` 暗色回退**  
  在现有 `.dark` 类选择器之外补充系统级暗色媒体查询，无需 JS 注入 `.dark` 类即可响应系统暗色模式。

#### 移除死代码 / 可读性

- **删除 `modal-bg-enter`**（约 25 行）  
  `MODAL_PUSH` 不再使用背景层进入动画，对应 CSS class、keyframes 及 `fr-ease-spring` 引用全部移除。

- **`slide-prev-enter-slide` keyframes 位置调整**  
  关键帧定义移至对应 class 声明紧后方，提升代码局部性。

---

### New Exports / API

#### `src/index.ts`

| 新增导出 | 类型 | 说明 |
|---|---|---|
| `warmDurationMs` | 函数 | JSDoc 已说明用户可手动调用，但之前未导出；现补全 |
| `ClassNames` | 类型 | 自定义 preset 作者需要此类型来正确标注 `forward`/`back` 字段 |
|| `useActivated` | Hook | 每次页面变为活跃时触发 |
|| `useDeactivated` | Hook | 每次页面离开时触发 |

---

### Bug Fixes

#### `keepAlive` 滚动位置丢失（tab 切换后重置为顶部）

**根本原因（双重）：**

1. `outlet.tsx` 中 `pageTransitionKey` 对 `depth > 0` 的 `AnimatedRoot`（如 `(auth)/_layout.tsx` 的 outlet）使用 `locationKey` 作为页面 key。每次 tab 切换产生新 `locationKey`，`TransitionGroup` 认为是新页面，导致 `TabsLayout` + `KeepAliveRoot` 被 unmount，所有缓存状态（含滚动位置）全部丢失。

2. `anim.css` 中 `.fr-tab-inactive` 使用 `display: none`，浏览器在 display 切换时会重置内部元素的滚动位置。

**修复：**

- `pageTransitionKey` 对所有层级统一使用 `layoutRouteId`（与 depth=0 保持一致）。同一 layout 下的 tab 导航返回相同 ID，中间层不再创建新 key，`KeepAliveRoot` 保持挂载。
- `.fr-tab-inactive` 改为 `visibility: hidden + position: absolute + overflow: hidden`，元素保留在 DOM 中，滚动状态不丢失。

---

### Tests

- **`transition.test.ts`** — 新增约 12 个用例：  
  REPLACE + scale、REPLACE + 自定义 preset、REPLACE + modal/none 仍无动画；  
  tabs slide tabIndex 缺失降级为 fade；per-preset durationMs PUSH/POP；modal preset 注册表内省。

- **`outlet.test.tsx`** — 新增约 6 个用例：  
  Bug 1（PageScope transition 更新后注册随之更新）；Bug 2（commitSettled 单次触发）；  
  Bug 3（连续导航 classNames 稳定、动画后仅剩 1 个页面节点）。

- **`anim-css.test.ts`** — 更新/新增约 5 个用例：  
  `will-change` 包含 opacity；scale/modal-bg keyframes 含 translate3d；modal-bg-enter 已移除；  
  slide-prev-enter-slide class 与 keyframes 相邻。

---

### Documentation

- **README.md** — 新增两节：  
  「tabs slide 必须配 `tabIndex`」使用说明；  
  「自定义动画时长 — per-preset `durationMs`」用法示例。

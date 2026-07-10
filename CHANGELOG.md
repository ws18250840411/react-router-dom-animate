# Changelog

All notable changes to `react-router-dom-animate` are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.1.0] — 2026-07-10

### Added

#### `<KeepAlive>` 组件 — Vue 风格的缓存声明方式

新增 `<KeepAlive>` 组件，作为启用页面保活的**推荐方式**。将需要缓存的 `<AnimatedOutlet>` 包裹在 `<KeepAlive>` 内，直观地表达"这里需要保活"，与 Vue 的 `<KeepAlive><RouterView /></KeepAlive>` 设计对称：

```tsx
// Tab 缓存（switch 模式）
<KeepAlive mode="switch" max={10} aliveRef={aliveRef}>
  <AnimatedOutlet transition="cover" />
</KeepAlive>

// 列表→详情→返回（stack 模式，默认）
<KeepAlive>
  <AnimatedOutlet transition="cover" />
</KeepAlive>
```

**设计原则：**
- `<AnimatedOutlet>` 只负责动画，`<KeepAlive>` 只负责缓存策略，关注点分离
- 嵌套 `<KeepAlive>` 完全独立，内层覆盖外层（最近祖先优先），互不影响
- 通过 `KeepAliveContext` 传递配置，`AnimatedOutlet` 自动读取，零运行时开销
- `include` / `exclude` 内部通过 `useRef` 存储，即使用户传入内联函数，Context value 也保持稳定，`AnimatedOutlet` 不会因此额外重渲染

**`KeepAlive` Props：**

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | `'stack' \| 'switch'` | `'stack'` | 缓存模式 |
| `max` | `number` | `30` | 最大缓存页数（LRU，仅 switch 模式）|
| `include` | `string[] \| RegExp \| (path) => boolean` | — | 缓存白名单（仅 switch 模式）|
| `exclude` | `string[] \| RegExp \| (path) => boolean` | — | 缓存黑名单（仅 switch 模式）|
| `aliveRef` | `RefObject<KeepAliveRef>` | — | 命令式缓存控制（仅 switch 模式）|

### Performance

#### `<KeepAlive>` — `include` / `exclude` 通过 Ref 稳定 Context

- **旧逻辑**：`include` / `exclude` 直接作为 `useMemo` 的依赖项。若用户传入内联函数（`exclude={(p) => ...}`），每次父组件重渲染都会生成新函数引用，导致 Context value 重建，进而使所有 `AnimatedOutlet` 消费者重渲染。
- **新逻辑**：`include` / `exclude` 通过 `useRef` 存储，Ref 对象本身引用稳定；Context value 的 `useMemo` 只依赖 `[mode, max, aliveRef]`，三者在典型用法中均不会变化。`KeepAliveRoot` 在每次导航时自然重渲染，届时从 Ref 读取最新的过滤函数，行为完全正确。
- **效果**：无论用户是否使用内联函数，`AnimatedOutlet` 均不再因 `include`/`exclude` 变化而产生额外重渲染。

### Breaking Changes

#### `AnimatedOutletProps` — 移除 keepAlive 相关 Props

以下 props 已从 `AnimatedOutletProps` 中移除，统一迁移至 `<KeepAlive>` 组件：

- `keepAlive?: boolean` → 改用 `<KeepAlive>` 包裹
- `max?: number` → 移至 `<KeepAlive max={...}>`
- `include?: KeepAliveFilter` → 移至 `<KeepAlive include={...}>`
- `exclude?: KeepAliveFilter` → 移至 `<KeepAlive exclude={...}>`
- `aliveRef?: RefObject<KeepAliveRef>` → 移至 `<KeepAlive aliveRef={...}>`

**迁移示例：**

```tsx
// 旧
<AnimatedOutlet keepAlive mode="switch" max={5} aliveRef={aliveRef} transition="cover" />

// 新
<KeepAlive mode="switch" max={5} aliveRef={aliveRef}>
  <AnimatedOutlet transition="cover" />
</KeepAlive>
```

> **注意**：通过路由 `handle: { keepAlive: true }` 配置的方式仍然有效（无需迁移），适用于不使用 `<KeepAlive>` 包裹的栈模式场景。

---

## [1.0.1] — 2026-07-06

### Fixed

#### `KeepAliveRoot` scroll 监听器 — 5 处淘汰路径未立即解绑（内存泄漏）

- **根因**：`scrollHandlersRef` 在组件体内被声明于 LRU 淘汰循环之后，导致 LRU 路径存在 Temporal Dead Zone（TDZ）访问错误。此外，LRU 淘汰、快速导航清理（`!shouldCache`）、`aliveRef.remove()`、`aliveRef.removeAll()`、`onExited` 非缓存页这 5 个独立的页面移除路径，均未在移除时立即调用 `removeEventListener`，而是依赖下次渲染的兜底清理，导致被淘汰页面的 scroll 监听器在一次渲染周期内泄漏。
- **修复**：
  1. 将 `scrollHandlersRef` 声明前移至 `scrollCacheRef` 旁边（在所有淘汰代码之前），消除 TDZ 问题。
  2. 提取 `detachScrollHandler(scrollHandlers, key)` 纯函数，集中 `removeEventListener` + `Map.delete` 逻辑。
  3. 在全部 5 处淘汰路径中调用 `detachScrollHandler`，实现即时清理，不再依赖渲染兜底。

#### `KeepAliveRoot.onExited` — `aliveRef.remove()` 在退出动画期间调用留孤立 activityMode 条目

- **根因**：`KeepAliveRoot` 的 `onExited` 回调在判断"是否需要 hidden"时，未检查 key 是否仍在 `keysRef` 中。若用户在退出动画期间通过 `aliveRef.remove()` 移除了该页面，`keysRef` 中已无该 key，但 `onExited` 仍会执行 `activityModesRef.current.set(key, 'hidden')`，导致 `activityModesRef` 中留下孤立条目，属于轻微内存泄漏。
- **修复**：在 `onExited` 中加入 `if (!keysRef.current.includes(key)) return` 前置守卫，确保对已被移除的 key 直接跳出，不留孤立状态。

### Fixed (Tests)

#### `layout-route.test.tsx` — 废弃 `tabs` prop 替换为 `mode="switch"`

- 该测试文件遗留了在 1.0.0 Breaking Change 中已移除的 `tabs` prop（`<AnimatedOutlet tabs transition="slide" />`）和 `handle: { tabs: true }`。
- 更新为现行 API：`<AnimatedOutlet mode="switch" transition="slide" />` 和 `handle: { mode: 'switch' }`。

### Performance

#### `KeepAliveRoot` scroll 监听器 — 增量式附加/移除

- **旧逻辑**：`useLayoutEffect`（无 dep 数组）每次渲染都执行 N × `removeEventListener` + N × `addEventListener`（N = 缓存页数量）。对稳定缓存（5–10 个 Tab 页），每次 React 渲染产生 10–20 次不必要的 DOM 操作。
- **新逻辑**：引入 `scrollHandlersRef`（`Map<key, { handler, container }>`），监听器在页面首次进入缓存时**只附加一次**，在页面被淘汰/移除时**才移除**。对稳定缓存，每次渲染的 DOM 操作数降至 0（仅遍历检查，不执行 add/remove）。
- 对于渲染频繁的应用（如动画期间高频 re-render），此优化可显著减少 DOM API 调用次数。

### Fixed (Tests)

#### `stress.spec.ts` — 首页矩阵连点用例偶发超时

- `el.click({ force: true })` 在极端压测中会遇到元素在转场期间从 DOM 卸载的情况，Playwright 默认重试 30 s 后超时。
- 修复：添加 `.catch(() => {})` 与其他压测用例保持一致，忽略 detach 导致的点击失败，不影响测试断言（断言为无残留 `fr-animating` 和无 JS 错误）。

### Tests

#### 新增 `aliveref-max.test.tsx`（15 个用例）

全面覆盖此前没有单元测试的三块 API：

- **`aliveRef` 命令式缓存控制**：
  - `getCached()` 返回正确的缓存路径列表（初始、多页访问后的 LRU 顺序）
  - `remove(pathname)` 移除指定页、下次访问重新 mount（state 重置）、对激活页无效
  - `removeAll()` 清除所有非激活页后仅剩当前页、切回被清除页 state 重置
- **`max` LRU 淘汰**：
  - 超出 `max` 时，最旧页被淘汰、不再出现在 `getCached()` 和 DOM
  - 重新访问被淘汰页重新 mount（LRU 顺序更新保护最新访问的页）
- **`setAnimDuration`**：
  - 覆盖 preset 的 `durationMs`（PUSH/POP 方向均生效）
  - 对未注册 type 调用不崩溃
- **Bug 回归**：`aliveRef.remove()` 在退出动画期间调用后，无孤立 `activityMode` 条目，目标页最终从 DOM 移除

---

## [1.0.0] — 2026-07-03

### Fixed

#### `BackgroundPreserveRoot` zombie entry 导致重复 React key

- **根因**：POP 时，退出动画中的条目（`alive=false`，stableKey 为 `X_2`）以 `[zombie, restored-root]` 顺序保留在 `stackRef` 中。若在退出动画完成前再次 PUSH 同一 stableKey（`X_2`）的新页面，PUSH 逻辑会在已有 zombie 的基础上追加新条目，导致两条 stableKey 相同的记录同时存在，React TransitionGroup 报重复 key 错误（`Encountered two children with the same key`），页面内容无法正常切换。
- **修复**：在 PUSH 分支中，先过滤掉所有与目标 `stableKey` 相同的 zombie entries（`alive=false`），再追加新条目，彻底消除重复 key 问题。

#### `keepAlive mode="switch" transition="slide"` tab 动画丝滑性改进

- **消除进入动画的位置 0 闪烁**：新页面进入时，两个渲染阶段（两帧 trick）期间引入了 `fr-tab-pre-enter-right` / `fr-tab-pre-enter-left` 初始位置 class，确保页面在 `enter` 阶段（CSSTransition 应用动画前的 RAF 间隙）始终保持在屏幕外（translate3d ±100%），而非短暂出现在位置 0 导致的视觉抖动。
- **快速多次点击无残留动画**：新增 `useLayoutEffect` 快速导航清理逻辑：当 `activePlan.duration === 0`（动画被打断、相同路径导航）时，在浏览器绘制前立即将所有非活动的可见页面设为 Activity `'hidden'`，防止被打断的进入动画 class 被移除后页面闪现在位置 0 再消失。
- **更流畅的缓动曲线**：为 tab 滑动动画新增专属 CSS 变量 `--fr-ease-tab`（默认 `cubic-bezier(0.4, 0, 0.2, 1)`，Material Design 标准）。所有 `tabs-slide-*` 动画类均应用此变量，替代原有的全局 `--fr-ease`，起速更快、收尾更平滑。
- **修复快速切换后动画方向错误**：三个组件（`AnimatedRoot`、`BackgroundPreserveRoot`、`KeepAliveRoot`）中移除了"相同 pathname 不调用 `commitSettled`"的早返回逻辑。该逻辑导致 A→B→A 快速切换后 `fromSnapRef` 过期，下一次导航方向判断（`tabIndex` 比较）出错。现在任何 `activePlan.duration === 0` 的情形都会及时同步 `settledLocation`。
- **修复"有时无动画"问题**：`fromSnapRef` 的更新时机从"动画完成后（`settledLocation.key === location.key`）"改为"每次新导航开始时（`lastToKeyRef !== location.key`）"。旧逻辑下，若 A→B 动画未完成就发起 B→A 导航，`fromSnapRef` 仍指向 A，导致 `planTransition(from=A, to=A)` 返回 `IDLE`（同路径判断），页面直接切换无动画。新逻辑始终将前次导航的目标（`toSnapRef.current`）作为下次导航的起点，无论动画是否完成，方向判断恒正确。
- **`KeepAliveRoot.onExited` 闭包修复**：`onExited` 中判断是否隐藏页面改为读取 `pageKeyRef.current`（ref）而非渲染闭包的 `isActive`，避免页面在退出动画期间重新变为激活状态时被错误 hidden。
- **`BackgroundPreserveRoot` 多项修复**：
  - REPLACE 导航到不同 `stableKey` 的页面现在也走 `pendingEnterRef` two-render trick，进入动画正常播放。
  - PUSH 新页面时，将 3 层及以上的非 top/second 条目立即设为 `Activity mode="hidden"`，防止深层页面在动画期间漏出。
  - `onExited` 回调改为从 `stackRef.current` 实时查询条目的 `alive` 状态（而非闭包），避免快速导航中旧 exit 动画完成时错误地 hidden 已重新激活的页面。

### Tests

- **新增 `keepAlive stack` 单元测试**（`src/__tests__/keepalive-stack.test.tsx`，9 个）：覆盖 `BackgroundPreserveRoot` 基础 PUSH→POP 状态保留、动画 class 出现、快速 PUSH/POP、REPLACE 动画（Bug #4 回归）、`fromSnapRef` 方向正确性（Bug #1 回归）。
- **新增 `keepAlive stack` E2E 测试**（`demo/e2e/keepalive-stack.spec.ts`，11 个）：覆盖浏览器中 cover 动画触发验证、快速 PUSH/POP 无残留节点、状态保留、fromSnapRef 多轮往返动画均有效。
- **新增 slide 动画方向回归 E2E 测试**（`demo/e2e/stress.spec.ts`，2 个）：验证 A→B→A→B 每轮切换均有 `fr-animating` class，以及 10 轮快速往返动画方向始终正确（"有时无动画" Bug #1 回归）。

---

## [1.0.0] — 2026-07-03（续）

### Added

#### `keepAlive mode="switch"` 新增 `include` / `exclude` 缓存过滤 props

类比 Vue `<KeepAlive :include :exclude>`，允许按路由 pathname 精细控制哪些页面应被保留在 Activity 缓存中：

- **`include`**：白名单，仅匹配的页面在离开时保留在缓存；不匹配的页面退出后立即销毁，下次进入重新 mount。
- **`exclude`**：黑名单，匹配的页面退出后立即销毁；其他页面正常缓存。
- 支持三种过滤形式：`string[]`（精确路径）、`RegExp`（正则）、`(pathname: string) => boolean`（函数谓词）。
- `include` 与 `exclude` 可同时使用，优先级：先过白名单 → 再过黑名单。

```tsx
// 只缓存 Tab 根页面
<AnimatedOutlet keepAlive mode="switch" include={['/home', '/profile', '/settings']} />

// 不缓存一次性流程页
<AnimatedOutlet keepAlive mode="switch" exclude={(path) => path.startsWith('/wizard')} />
```

**新增导出**：`KeepAliveFilter` 类型从 `react-router-dom-animate` 包导出。

#### `TabPreset` 接口与通用 tab 动画

- 为 `AnimPreset` 新增可选 `tab?: TabPreset` 字段，描述 `keepAlive mode="switch"` 场景下的方向性动画变体（`forward`、`back`、`undirected`、`bidirectional`）。
- 内置预设（`cover`、`slide`、`fade`、`scale`、`modal`、`none`）全部补充 `tab` 字段。
- `classNamesForTabs` 函数完全重写为通用逻辑，通过 `preset.tab` 驱动，消除对具体动画类型的硬编码判断。
- 新增 CSS 预定位 class `fr-tab-pre-enter-scale` / `fr-tab-pre-enter-fade`，防止 `scale` / `fade` 动画在 keepAlive tab 模式下首帧闪烁。

### Fixed

- `presetOf`：使用未注册的动画类型时新增 `console.warn` 提示，不再静默降级。
- `warmDurationMs`：由硬编码类型列表改为动态遍历 `animPresetRegistry.types()`，自定义 preset 的 `durationMs` 现在也会被正确预热。
- `slide.tab.undirected`：修正为 `TAB_FADE_FORWARD`（含预定位 class），避免无 `tabIndex` 时闪烁。
- 移除死代码 `TAB_MODAL_POP`。

### Tests

- **新增 `presetOf` 未知类型警告单元测试**（`src/__tests__/transition.test.ts`，3 个）：覆盖通过 `classNamesFor`、`planTransition` fallback 触发警告，以及回退 cover 动画正常的场景。
- **新增 `keepAlive switch include/exclude` 单元测试**（`src/__tests__/outlet.test.tsx`，5 个）：覆盖 `string[]`、`RegExp`、函数谓词三种过滤形式，以及 `include`+`exclude` 组合。
- **新增 scale / fade tab 动画 E2E 测试**（`demo/e2e/keepalive-switch-cover.spec.ts`，5 个）：验证 `scale`、`fade` 在 keepAlive switch 模式下 forward/backward 动画均有 `fr-animating` class，state 保留，无 JS 错误，快速连点无残留。
- **新增 include/exclude E2E 测试**（`demo/e2e/keepalive-switch-filter.spec.ts`，4 个）：在真实浏览器中验证 `exclude` prop 行为——被排除的页面（Tab B）离开后 DOM 移除、再次进入 state 重置（新实例 mount）；未排除的页面（Tab A/C）state 正常保留。同时新增 `/keep-alive-filter` demo 路由以支持 E2E 场景。

## [1.0.0] — 2026-07-01（初稿，合并至 1.0.0）

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

---

*1.0.0 是首个正式发布版本，包含完整的 keepAlive stack/switch 实现、通用 TabPreset 动画系统、include/exclude 缓存过滤、115 个单元测试和多套 E2E 测试套件。*

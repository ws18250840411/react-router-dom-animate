# 设计依据（Design References）

本库每个核心机制均对应业界已有实现或官方 API，避免自研状态机。

| 模块 | 实现 | 依据 |
|------|------|------|
| 渲染容器 | `TransitionGroup` + `CSSTransition` | [RTG TransitionGroup](https://reactcommunity.org/react-transition-group/transition-group/)：改 `key` 触发进出场 |
| 离场页冻结 | `FrozenPage` + `useState(outlet)` | [unplugin outlet-component.ts](https://github.com) 同构 |
| Location 快照 | `useEffect` 更新 `fromSnapRef` | unplugin `prevPathRef` + `useEffect` 模式 |
| 转场 key | `location.key` | [React Router Location](https://reactrouter.com/en/main/hooks/use-location)：`key` 唯一标识一次 history 条目 |
| classNames | `classNamesFor` / `planTransition` | unplugin `getMode` + `buildClassNames` 等价（`scale` 为扩展预设） |
| 动画时长 | `readDurationMs()` 读 `--fr-duration` | unplugin `readDuration()` |
| 样式交付 | 入口 `import './anim.css'` 随组件自动加载 | 也可单独 `import '…/anim.css'` |
| 编程式动画 | `history.state.transition` | [History API state](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState) + unplugin `__animationType` |
| route.handle | `handle.transition` | [React Router Route handle](https://reactrouter.com/en/main/route/route#handle) |
| 转场 busy | `duration + buffer` 定时 | RTG `timeout` 与 CSS `animation-duration` 对齐（unplugin 同做法） |
| 导航 defer | `runOrEnqueue` | [Vue Router 导航守卫](https://router.vuejs.org/guide/advanced/navigation-guards.html)：`next()` 延迟执行同类语义 |
| childFactory | `cloneElement(child, { classNames, timeout })` | [RTG childFactory](https://reactcommunity.org/react-transition-group/transition-group/#TransitionGroup-prop-childFactory)：离场子节点仍注入当前 classNames |
| nodeRef Map | 按 `location.key` 缓存 ref | RTG 推荐 `nodeRef` 替代 findDOMNode（[Migration](https://github.com/reactjs/react-transition-group/blob/master/Migration.md)） |

## 刻意不做的事

- **不用自研 `settledRef` + 双闸门 commit**：unplugin 无此逻辑；Framer `sync` 模式也不做 app 级 commit
- **不用运行时 inject CSS**：`outlet.tsx` 内 `import './anim.css'`，随组件入口由打包器注入
- **不声称 Ionic `onFinish` 等价实现**：Ionic 使用 Web Animation API 单时间轴；本库用 RTG + CSS keyframes

## 数据流

```
navigate → location 更新
  → render: planTransition(fromSnapRef, location)   // fromSnap 尚未被 effect 更新
  → TransitionGroup 同时对进/离场页施加 classNames
  → useEffect: fromSnapRef ← 当前 location
  → timeout 到期: 清除 animBusy，flush 导航队列
```

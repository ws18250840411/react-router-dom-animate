# react-router-dom-animate

Page transitions and keep-alive caching for [react-router-dom](https://reactrouter.com/) v7, powered by React 19.2 [`<Activity>`](https://react.dev/reference/react/Activity).

```bash
npm install react-router-dom-animate
```

**Requires** React 19.2+, React Router 7, and a Data Router (`createBrowserRouter` + `<RouterProvider>`). **Browser-only** — mark components with `'use client'` in Next.js / Remix.

---

## Quick Start

Replace `<Outlet />` with `<AnimatedOutlet />` in your root layout for an iOS-style `cover` transition out of the box:

```tsx
import { AnimatedOutlet } from 'react-router-dom-animate'

export function RootLayout() {
  return <AnimatedOutlet />
}
```

Set animations via route `handle` or navigation `state`; `navigate(-1)` plays the reverse automatically:

```tsx
{ path: 'detail/:id', handle: { transition: 'slide' }, element: <DetailPage /> }
navigate('/detail/1', { state: { transition: 'modal' } })
```

| Type | Effect |
|------|--------|
| `cover` | Slide in from right (**default**) |
| `slide` | Both pages slide together |
| `fade` / `scale` / `modal` / `none` | Cross-fade / zoom / bottom sheet / instant |

---

## Common Patterns

### List → detail (preserve state + scroll)

```tsx
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'

<KeepAlive>
  <AnimatedOutlet transition="cover" />
</KeepAlive>
```

On PUSH the list stays alive in the background; on POP everything is restored. Stack mode manages the back stack — no `max` needed.

### Bottom tabs (preserve state on switch)

Keep the tab bar **sibling** to `<AnimatedOutlet />`, not inside it:

```tsx
export function TabsLayout() {
  return (
    <>
      <KeepAlive mode="switch">
        <AnimatedOutlet transition="slide" />
      </KeepAlive>
      <nav>{/* tab buttons */}</nav>
    </>
  )
}
```

Add `tabIndex` to routes for directional `slide` / `cover` (lower → higher = slide right):

```tsx
{ path: 'home', handle: { tabIndex: 0 }, element: <HomeTab /> }
```

| Need | Pattern |
|------|---------|
| Instant, no animation | `<AnimatedOutlet mode="switch" />` |
| Animation, no cache | `<AnimatedOutlet mode="switch" transition="slide" />` |
| Animation + state preserved | `<KeepAlive mode="switch"><AnimatedOutlet transition="slide" /></KeepAlive>` |

### Root layout cache policy

Stack keep-alive at root + instant switch in tab layout is the recommended mobile pattern:

```tsx
// Root — declare once
<KeepAlive include={['HomeTab', 'DiscoverTab', 'ProfileTab']}>
  <AnimatedOutlet />
</KeepAlive>

// Route handle — name pages to cache
export const handle = { keepAliveName: 'HomeTab', tabIndex: 0 }

// Tab layout — override mode only; switch without transition is instant
<AnimatedOutlet mode="switch" />
```

Stack keep-alive can also be enabled via route handle without wrapping: `handle: { keepAlive: true }`.

---

## API Reference

### `<AnimatedOutlet>`

| Prop | Default | Description |
|------|---------|-------------|
| `transition` | `'cover'` | Built-in or custom preset name |
| `mode` | `'stack'` | `stack` = directional; `switch` = flat. Inherits `<KeepAlive>` mode when wrapped |
| `className` | — | Wrapper class |

### `<KeepAlive>`

| Prop | Default | Description |
|------|---------|-------------|
| `mode` | `'stack'` | `stack` for drill-down; `switch` for tab cache |
| `max` | `30` | LRU limit (switch only) |
| `include` / `exclude` | — | Allow/deny list by pathname or `keepAliveName` (switch only) |
| `aliveRef` | — | Imperative cache control (switch only) |

`aliveRef` methods: `remove(pathname)` · `removeAll()` · `getCached()`

> Switching `mode` at runtime clears all cached state. `include`, `exclude`, and `max` are stored in refs — inline functions won't rebuild Context.

### Lifecycle hooks

Components don't remount in keep-alive mode:

```tsx
useActivated(() => fetchData())    // page becomes visible (incl. initial mount)
useDeactivated(() => cleanup())    // page hidden or unmounted
```

> `<Activity>` hides via `display:none`; browsers pause `<video>`/`<audio>`.

---

## Custom Animations

**CSS variables** (recommended): `--fr-duration` (global), `--fr-duration-cover`, etc. (per type).

**JS**: `setAnimDuration('modal', 450)` — overrides CSS.

**Register a preset**:

```ts
import { registerAnimPreset, unregisterAnimPreset } from 'react-router-dom-animate'

registerAnimPreset({ type: 'my-flip', forward: { ... }, back: { ... }, durationMs: 600 })
<AnimatedOutlet transition="my-flip" />

unregisterAnimPreset('my-flip')  // for HMR
```

Reduced-motion OS setting automatically resolves to 0ms transitions.

---

## Demo

```bash
npm run demo   # http://localhost:5180
```

See [CHANGELOG.md](./CHANGELOG.md) for full release notes. MIT

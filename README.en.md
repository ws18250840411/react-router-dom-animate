# react-router-dom-animate

Page transitions and keep-alive caching for [react-router-dom](https://reactrouter.com/) v7, powered by React 19.2 [`<Activity>`](https://react.dev/reference/react/Activity).

```bash
npm install react-router-dom-animate
```

**Requires** React 19.2+, React Router 7, and a Data Router (`createBrowserRouter` + `<RouterProvider>`). **Browser-only** — mark components with `'use client'` in Next.js / Remix.

---

## Live Demo

- StackBlitz (loads only `demo/stackblitz`): [Open Demo](https://stackblitz.com/github/ws18250840411/react-router-dom-animate/tree/master/demo/stackblitz)
- The demo uses the published npm package and does not expose the repository source.
- Try it live: global transition switch (6 types), list→detail stack navigation, KeepAlive Tabs with state preservation, `useActivated` / `useDeactivated` lifecycle logs.

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
| `onTransitionStart` | - | Fires when a transition starts (including instant). Use for loading, analytics |
| `onTransitionEnd` | - | Fires when transition completes (settled location committed) |

### `<KeepAlive>`

| Prop | Default | Description |
|------|---------|-------------|
| `mode` | `'stack'` | `stack` for drill-down; `switch` for tab cache |
| `max` | `30`(switch) / `10`(stack) | switch: LRU limit; stack: back-stack depth limit, evicts oldest from bottom |
| `include` / `exclude` | — | Allow/deny list by pathname or `keepAliveName` (switch only) |
| `aliveRef` | - | Imperative cache control (both modes) |

`aliveRef` methods (both stack and switch):

```ts
aliveRef.current?.remove('/list')    // remove a cached page by pathname
aliveRef.current?.removeAll()        // remove all inactive cached pages
aliveRef.current?.getCached()        // get list of cached pathnames
```


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

### CSS Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--fr-duration` | `300ms` | Global animation duration |
| `--fr-duration-{type}` | - | Per-type override, e.g. `--fr-duration-modal: 450ms` |
| `--fr-ease` | `cubic-bezier(.25,.46,.45,.94)` | Default easing |
| `--fr-ease-spring` | `cubic-bezier(.32,.72,0,1)` | Spring easing (modal/slide-up) |
| `--fr-ease-tab` | `cubic-bezier(.4,0,.2,1)` | Tab switch easing |
| `--fr-page-bg` | `#f9fafb` | Page background (light) |
| `--fr-page-bg-dark` | `#030712` | Page background (dark) |
| `--fr-modal-overlay` | `rgba(15,23,42,.55)` | Modal overlay color |
| `--fr-pending-bg` | `rgba(255,255,255,.4)` | Loader pending overlay color |

### Route Loading State

When a React Router 7 loader is pending, the container gets a `data-pending` attribute with a subtle overlay:

```css
/* Custom overlay */
.animated-outlet-group[data-pending]::after {
  background: url('/spinner.svg') center / 24px no-repeat;
}
```

### Transition Callbacks

```tsx
<AnimatedOutlet
  onTransitionStart={() => NProgress.start()}
  onTransitionEnd={() => NProgress.done()}
/>
```

> Instant transitions (duration=0 or reduced-motion) also fire callbacks.

---

## Demo

```bash
npm run demo   # http://localhost:5180
```

---

## Source Structure (contributor reference)

```
src/
├── index.ts          # Public API entry (exports + CSS injection + warmDurationMs)
├── types.ts          # All TypeScript type definitions
├── transition.ts     # Animation preset registry, planTransition, CSS duration reading
├── anim.css          # Built-in animation styles + CSS variables
├── context.tsx       # React Context definitions (LocCtxValue, DepthContext, KeepAliveContext, …)
├── common.tsx        # Shared utilities (PageScope, FrozenOutlet, PageTransition, snap, …)
├── hooks.ts          # Lifecycle hooks (useActivated, useDeactivated)
├── stack-root.tsx    # BackgroundPreserveRoot (stack mode PUSH/POP + iOS scroll restore)
├── switch-root.tsx   # KeepAliveRoot (switch mode LRU cache + include/exclude filter)
├── animated-root.tsx # AnimatedRoot + LayoutScopeRegistrar (no-cache TransitionGroup mode)
└── outlet.tsx        # Entry layer: KeepAlive / AnimatedOutlet components
```

AnimatedOutlet internal dispatch:

```
AnimatedOutlet
├── children + transition ──→ PageScope (register page-level animation override)
├── keepAlive=true
│   ├── mode=switch ────────→ KeepAliveRoot (LRU tab cache, Activity show/hide)
│   └── mode=stack  ────────→ BackgroundPreserveRoot (back stack, PUSH/POP)
└── default ────────────────→ AnimatedRoot (TransitionGroup, no cache)
```

See [CHANGELOG.md](./CHANGELOG.md) for full release notes. MIT

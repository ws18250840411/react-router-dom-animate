# react-router-dom-animate

A lightweight page transition library for [react-router-dom](https://reactrouter.com/), built on [react-transition-group](https://reactcommunity.org/react-transition-group/).

## Features

- Nested `AnimatedOutlet` — different regions can have different animations
- Configure via JS (`navigate` + `state`) or component (`handle` / props)
- Extend with custom presets via `registerAnimPreset`
- `keepAlive` mode — keep pages mounted in memory with lifecycle hooks

## Installation

```bash
npm install react-router-dom-animate
```

**Peer dependencies:** `react` ≥18, `react-dom` ≥18, `react-router-dom` ≥7

## Quick Start

### 1. `main.tsx`

```tsx
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { routes } from './routes'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
)
```

### 2. `routes.tsx`

Wrap your outlet with `AnimatedOutlet`:

```tsx
import type { RouteObject } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'
import { HomePage } from './pages/HomePage'
import { AboutPage } from './pages/AboutPage'

export const routes: RouteObject[] = [
  {
    element: <AnimatedOutlet />, // default: cover
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
    ],
  },
]
```

### 3. Specify a transition (two options)

**Option A** — pass via `navigate` state:

```tsx
navigate('/about', { state: { transition: 'fade' } })
```

**Option B** — declare on the route or component:

```tsx
// In routes.tsx
{ path: 'about', element: <AnimatedOutlet transition="fade"><AboutPage /></AnimatedOutlet> }

// Or directly in the page component
export function AboutPage() {
  return (
    <AnimatedOutlet transition="fade">
      <div>About content</div>
    </AnimatedOutlet>
  )
}
```

`navigate(-1)` (back navigation) does not need state — the reverse transition is applied automatically.

## Props Reference

| Prop | Description | Default |
|------|-------------|---------|
| `transition` | `cover` · `slide` · `fade` · `scale` · `modal` · `none` | `cover` |
| `mode` | `stack` push to detail; `switch` flat tab switching | `stack` |
| `keepAlive` | Keep pages alive. `mode="stack"`: stack mode (list→detail). `mode="switch"`: switch mode (tab cache). | — |

## Tab Usage

Two things are needed: **tab bar outside `<AnimatedOutlet>`**, **content area with `mode="switch"`**.

```tsx
// routes.tsx
{
  path: 'tabs',
  element: <TabsLayout />,
  children: [
    { path: 'home', element: <HomeTab /> },
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
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-hidden">
        <AnimatedOutlet mode="switch" />
      </main>
      <nav className="flex border-t">
        <NavLink to="/tabs/home" replace>Home</NavLink>
        <NavLink to="/tabs/profile" replace>Profile</NavLink>
      </nav>
    </div>
  )
}
```

For `transition="slide"` with multiple tabs, add `tabIndex` to each tab route's `handle`:

```tsx
{ path: 'home',    handle: { tabIndex: 0 }, element: <HomeTab /> }
{ path: 'profile', handle: { tabIndex: 1 }, element: <ProfileTab /> }
```

## Custom Animation Duration

### CSS Variables (recommended)

Control globally via `--fr-duration` (default 300ms). Each animation type can be overridden individually via `--fr-duration-{type}`:

```css
:root {
  /* Global fallback — used for any type not explicitly set */
  --fr-duration: 300ms;

  /* Per-type overrides (optional — omit to inherit global value) */
  --fr-duration-cover: 300ms;   /* cover: new page slides over from the right */
  --fr-duration-slide: 280ms;   /* slide: both pages slide in the same direction */
  --fr-duration-fade: 200ms;    /* fade: crossfade */
  --fr-duration-scale: 250ms;   /* scale: zoom */
  --fr-duration-modal: 450ms;   /* modal: bottom sheet, usually slower feels more natural */
  --fr-duration-none: 0ms;      /* none: no animation (usually no need to set) */
}
```

### JS (optional)

To override only the duration in JS (without replacing CSS class names), use `setAnimDuration`:

```tsx
import { setAnimDuration } from 'react-router-dom-animate'

setAnimDuration('modal', 450)
setAnimDuration('slide', 250)
```

To also replace the animation CSS classes, use `registerAnimPreset`:

```tsx
import { registerAnimPreset } from 'react-router-dom-animate'

registerAnimPreset({
  type: 'my-flip',
  forward: { enter: 'flip-enter', enterActive: 'flip-enter-active', exit: 'flip-exit', exitActive: 'flip-exit-active' },
  back:    { enter: 'flip-enter-back', enterActive: 'flip-enter-back-active', exit: 'flip-exit-back', exitActive: 'flip-exit-back-active' },
  durationMs: 600,
})
```

**Priority**: `registerAnimPreset({ durationMs })` / `setAnimDuration` > `--fr-duration-{type}` > `--fr-duration`

## Advanced API

### `keepAlive` — based on React 19 `<Activity>`

`keepAlive` uses React 19.2's official [`<Activity>`](https://react.dev/reference/react/Activity) primitive — no third-party dependencies. Switching pages will **not remount** the component; state, DOM nodes (including scroll positions), and loaded data are fully preserved.

#### Stack mode (`keepAlive`, `mode` defaults to `stack`)

For list → detail navigation where the background page state must be retained:

```tsx
<AnimatedOutlet keepAlive />
<AnimatedOutlet keepAlive transition="cover" />
```

On PUSH, the background page stays alive in the DOM. On POP, the foreground page exits with animation and the background page is restored exactly.

#### Switch mode (`keepAlive mode="switch"`)

For bottom navigation bars and multi-tab UIs:

```tsx
<AnimatedOutlet keepAlive mode="switch" />
<AnimatedOutlet keepAlive mode="switch" transition="slide" />
```

All visited pages are cached by pathname and instantly shown/hidden when switching.

#### `max` — LRU cache limit (switch mode only)

```tsx
<AnimatedOutlet keepAlive mode="switch" max={10} />
```

When the number of cached pages exceeds `max`, the least recently used page is evicted. Omitting `max` means no limit.

#### `aliveRef` — imperative cache control (switch mode only)

Use this when you need to clear caches programmatically (e.g. logout, force-refresh):

```tsx
import { useRef } from 'react'
import type { KeepAliveRef } from 'react-router-dom-animate'
import { AnimatedOutlet } from 'react-router-dom-animate'

function Layout() {
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  return (
    <>
      <button onClick={() => aliveRef.current?.remove('/profile')}>Clear profile cache</button>
      <button onClick={() => aliveRef.current?.removeAll()}>Logout — clear all caches</button>
      <AnimatedOutlet keepAlive mode="switch" aliveRef={aliveRef} />
    </>
  )
}
```

| Method | Description |
|--------|-------------|
| `remove(pathname)` | Remove the cache for a specific pathname; next visit will remount |
| `removeAll()` | Remove all caches except the currently active page |
| `getCached()` | Returns the list of all currently cached pathnames |

#### Reading config from route `handle`

Instead of passing props to every `AnimatedOutlet`, declare them centrally in the route `handle`:

```ts
// routes.tsx
{
  path: 'home',
  handle: { keepAlive: true, transition: 'cover' },
  element: <HomeLayout />,  // AnimatedOutlet inside needs no props
}
// Bottom tab scenario
{
  path: 'tabs',
  handle: { keepAlive: true, mode: 'switch', transition: 'fade' },
  element: <TabsLayout />,
}
```

Props take precedence over handle values; both can coexist.

#### Differences from Vue `keepAlive`

| Behavior | Vue `keepAlive` | React `<Activity>` |
|----------|-----------------|---------------------|
| Component state | ✅ Preserved | ✅ Preserved |
| DOM / scrollTop | ✅ Preserved | ✅ Preserved (with manual save/restore) |
| `useEffect` | ⏸ Paused, not cleaned up | 🔄 Cleaned up when hidden, re-run when visible |
| `onActivated` | Dedicated lifecycle | `useActivated` hook |
| `onDeactivated` | Dedicated lifecycle | `useDeactivated` hook |
| video / audio / iframe | ✅ Unaffected | ⚠️ Pauses or reloads when hidden (see below) |

> **`useEffect` impact**: Side effects like polling or WebSockets are automatically cleaned up when hidden and re-established when visible — this is generally the safer behavior.
>
> **video / audio / iframe caveat**: `<Activity>` hides pages via `display:none`, which causes browsers to pause `<video>`/`<audio>` playback and may trigger `<iframe>` reloads. This is a browser-level behavior that cannot be worked around in JavaScript. If your page contains media players or embedded documents, use `useDeactivated` to save the playback position and `useActivated` to restore it.

### `useActivated` / `useDeactivated` — page lifecycle hooks

Monitor when a page becomes active or leaves:

```tsx
import { useActivated, useDeactivated } from 'react-router-dom-animate'

function ProfilePage() {
  const [data, setData] = useState([])

  // Fires each time the page becomes active (including initial mount)
  useActivated(() => {
    fetch('/api/profile').then(r => r.json()).then(setData)
  })

  // Fires when page is hidden or unmounted
  useDeactivated(() => {
    abortController.abort()
  })

  return <Profile data={data} />
}
```

| | `keepAlive` mode | Without `keepAlive` |
|--|-----------------|---------------------|
| `useActivated` | Fires each time the page becomes active (including initial mount) | Equivalent to `useEffect(() => cb(), [])` |
| `useDeactivated` | Fires when page is hidden or the keepAlive group unmounts | Equivalent to `useEffect(() => () => cb(), [])` |

## Demo

```bash
npm run demo   # http://localhost:5180
```

`/push/*` = approach A (`state`), `/wrap/*` = approach B (component / `handle`), `/keep-alive` = full KeepAlive example.

MIT

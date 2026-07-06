# react-router-dom-animate

Lightweight stack-based page transitions for [react-router-dom](https://reactrouter.com/) v7+, powered by React 19's [`<Activity>`](https://react.dev/reference/react/Activity).

**Install**

```bash
npm install react-router-dom-animate
```

> Peer deps: `react` ≥19, `react-dom` ≥19, `react-router-dom` ≥7

---

## Getting Started

### Step 1: Replace `<Outlet />` with `<AnimatedOutlet />`

In your root layout (the component that renders `<Outlet />`):

```tsx
// layout.tsx (or root.tsx)
import { AnimatedOutlet } from 'react-router-dom-animate'

export function RootLayout() {
  return (
    <div>
      {/* header, sidebar, etc. stay the same */}
      <AnimatedOutlet />  {/* ← only change this */}
    </div>
  )
}
```

Done. All child pages now have a default `cover` (iOS-style slide-over) animation.

### Step 2: Set a transition

**Easiest way** — declare it on the route:

```tsx
// routes.tsx
{
  path: 'detail/:id',
  element: (
    <AnimatedOutlet transition="cover">
      <DetailPage />
    </AnimatedOutlet>
  ),
}
```

**Or per-navigation** (when you don't want to touch routes):

```tsx
navigate('/detail/1', { state: { transition: 'cover' } })
```

Both approaches are equivalent. `navigate(-1)` automatically plays the reverse animation — no extra config needed.

### Step 3: Pick an animation

| Animation | Effect |
|-----------|--------|
| `cover` | New page slides in from the right and covers the old one (iOS style), **default** |
| `slide` | Both pages slide in the same direction (Android style) |
| `fade` | Cross-fade |
| `scale` | Zoom in/out |
| `modal` | Slides up from the bottom (for sheet-style overlays) |
| `none` | Instant switch, no animation |

---

## Props Reference

```tsx
<AnimatedOutlet
  transition="cover"         // animation type, see table above
  mode="stack"               // stack (default) | switch
  keepAlive={false}          // keep pages alive in the DOM
  max={undefined}            // max cached pages (keepAlive + switch only)
  include={undefined}        // cache allow-list (keepAlive + switch only)
  exclude={undefined}        // cache deny-list (keepAlive + switch only)
  aliveRef={undefined}       // imperative cache control (keepAlive + switch only)
  className={undefined}      // extra class added to the outer container
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `transition` | `string` | `'cover'` | Built-in: `cover` `slide` `fade` `scale` `modal` `none`; or a custom preset name |
| `mode` | `'stack' \| 'switch'` | `'stack'` | `stack`: push-to-detail; `switch`: flat tab switching |
| `keepAlive` | `boolean` | `false` | Keep pages alive. Stack mode preserves background pages; switch mode caches all visited pages |
| `max` | `number` | unlimited | Max cached pages; oldest evicted via LRU (switch mode only) |
| `include` | `string[] \| RegExp \| (path) => boolean` | — | Allow-list: only matching pages are cached (switch mode only) |
| `exclude` | `string[] \| RegExp \| (path) => boolean` | — | Deny-list: matching pages are destroyed on exit (switch mode only) |
| `aliveRef` | `RefObject<KeepAliveRef>` | — | Imperative cache control handle (switch mode only) |
| `className` | `string` | — | Added to the `.animated-outlet-group` wrapper |

> **Config via route `handle`** (avoids repeating props on every `AnimatedOutlet`):
>
> ```ts
> { path: 'detail', handle: { transition: 'cover', keepAlive: true }, element: <Layout /> }
> ```

---

## Tab Navigation

### Basic tabs (instant switch, no animation)

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
      {/* content area */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        <AnimatedOutlet mode="switch" />
      </main>
      {/* tab bar goes OUTSIDE AnimatedOutlet */}
      <nav style={{ display: 'flex', borderTop: '1px solid #eee' }}>
        <NavLink to="/tabs/home"    replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>Home</NavLink>
        <NavLink to="/tabs/profile" replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>Profile</NavLink>
      </nav>
    </div>
  )
}
```

> **Key point**: `nav` and `<AnimatedOutlet>` are siblings — the tab bar does not participate in transitions.

### Animated tabs

```tsx
<AnimatedOutlet mode="switch" transition="fade" />   {/* cross-fade */}
<AnimatedOutlet mode="switch" transition="slide" />  {/* left/right slide */}
```

`transition="slide"` requires `tabIndex` in each tab's `handle` — otherwise direction is ambiguous and falls back to `fade`:

```tsx
{ path: 'home',    handle: { tabIndex: 0 }, element: <HomeTab /> }
{ path: 'profile', handle: { tabIndex: 1 }, element: <ProfileTab /> }
```

---

## keepAlive

Switching pages does **not** remount the component — state, DOM nodes, and scroll positions are fully preserved. Powered by React 19's official `<Activity>` — no third-party dependencies.

### Stack mode (list → detail)

For list → detail → back-to-list navigation:

```tsx
<AnimatedOutlet keepAlive />
<AnimatedOutlet keepAlive transition="cover" />
```

On PUSH the background page stays alive in the DOM. On POP the foreground page exits and the background is restored exactly (including scroll position).

### Switch mode (tab cache)

For bottom navigation bars and multi-tab UIs:

```tsx
<AnimatedOutlet keepAlive mode="switch" />
<AnimatedOutlet keepAlive mode="switch" transition="slide" />
```

All visited pages are cached by pathname. Scroll positions are automatically saved and restored.

**Limit cache size (LRU):**

```tsx
<AnimatedOutlet keepAlive mode="switch" max={10} />
```

When over `max`, the least recently used page is evicted. A fixed tab bar is naturally bounded, so `max` is optional there.

**Allow-list / deny-list:**

```tsx
// cache only these 3 tabs; other pages are destroyed on exit
<AnimatedOutlet keepAlive mode="switch" include={['/home', '/profile', '/settings']} />

// never cache form pages (destroyed on exit to avoid stale data)
<AnimatedOutlet keepAlive mode="switch" exclude={['/checkout', '/payment']} />

// RegExp and predicate functions also work
<AnimatedOutlet keepAlive mode="switch" exclude={(path) => path.startsWith('/form')} />
```

`include` and `exclude` can be combined: a page is cached only if it passes `include` **and** does not match `exclude`.

### Imperative cache control (aliveRef)

Use when you need to clear caches programmatically (e.g. logout):

```tsx
import { useRef } from 'react'
import { AnimatedOutlet } from 'react-router-dom-animate'
import type { KeepAliveRef } from 'react-router-dom-animate'

function TabsLayout() {
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  const handleLogout = () => {
    aliveRef.current?.removeAll()  // clear all cached pages
    navigate('/login')
  }

  return (
    <>
      <AnimatedOutlet keepAlive mode="switch" aliveRef={aliveRef} />
      <button onClick={handleLogout}>Logout</button>
    </>
  )
}
```

| Method | Description |
|--------|-------------|
| `remove(pathname)` | Remove the cache for a specific pathname; next visit remounts |
| `removeAll()` | Remove all caches except the currently active page |
| `getCached()` | Returns the list of cached pathnames (LRU order, tail = most recent) |

### Lifecycle hooks

Components don't remount in `keepAlive` mode — use these hooks to react to page enter/exit:

```tsx
import { useActivated, useDeactivated } from 'react-router-dom-animate'

function ProfilePage() {
  useActivated(() => {
    // runs each time the page becomes active, including initial mount
    fetchLatestData()
  })

  useDeactivated(() => {
    // runs when the page is hidden or the keepAlive group unmounts
    cancelPendingRequests()
  })
}
```

| | `keepAlive` mode | Without `keepAlive` |
|--|-----------------|---------------------|
| `useActivated` | Fires each time the page becomes active (including initial mount) | Equivalent to `useEffect(() => cb(), [])` |
| `useDeactivated` | Fires when page is hidden or the group unmounts | Equivalent to `useEffect(() => () => cb(), [])` |

> **Note**: `<Activity>` hides pages via `display:none`. Browsers will pause `<video>`/`<audio>` and may reload `<iframe>`. Use `useDeactivated` to save progress and `useActivated` to restore it.

---

## Custom Animation Duration

### CSS variables (recommended)

```css
:root {
  --fr-duration: 300ms;        /* global duration (default 300ms) */
  --fr-duration-modal: 450ms;  /* per-type override */
  --fr-duration-slide: 280ms;
}
```

Supported variable names: `--fr-duration-cover` `--fr-duration-slide` `--fr-duration-fade` `--fr-duration-scale` `--fr-duration-modal`

### JS

```ts
import { setAnimDuration } from 'react-router-dom-animate'

setAnimDuration('modal', 450)  // takes priority over CSS variables
```

### Register a custom animation preset

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

// use it just like a built-in animation
<AnimatedOutlet transition="my-flip" />
navigate('/page', { state: { transition: 'my-flip' } })
```

---

## Demo

```bash
npm run demo   # http://localhost:5180
```

MIT

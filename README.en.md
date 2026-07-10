# react-router-dom-animate

Smooth, production-ready page transitions and keep-alive caching for [react-router-dom](https://reactrouter.com/) v7+.  
Powered by React 19's [`<Activity>`](https://react.dev/reference/react/Activity) — no third-party runtime, zero magic.

**Install**

```bash
npm install react-router-dom-animate
```

> Peer deps: `react` ≥19, `react-dom` ≥19, `react-router-dom` ≥7

---

## Quick Start (30 seconds)

Replace `<Outlet />` with `<AnimatedOutlet />` in your root layout:

```tsx
// layout.tsx
import { AnimatedOutlet } from 'react-router-dom-animate'

export function RootLayout() {
  return (
    <div>
      <AnimatedOutlet />  {/* ← that's it */}
    </div>
  )
}
```

Every child page now animates with an iOS-style `cover` slide. **No other config needed.**

---

## Animations

| Type | Effect | Use for |
|------|--------|---------|
| `cover` | New page slides in from the right, covers the old one | Drill-down navigation (**default**) |
| `slide` | Both pages slide together in the same direction | Android-style navigation |
| `fade` | Cross-fade | Smooth, subtle transitions |
| `scale` | Zoom in/out | Dashboard → detail |
| `modal` | Slides up from the bottom | Sheets, bottom drawers |
| `none` | Instant switch | Tabs (no animation) |

**Set the animation two ways:**

```tsx
// Option A: on the route (applied automatically for that page)
{ path: 'detail/:id', handle: { transition: 'cover' }, element: <DetailPage /> }

// Option B: at navigation time (no route changes required)
navigate('/detail/1', { state: { transition: 'cover' } })
```

Back navigation (`navigate(-1)`) plays the reverse animation automatically.

---

## Tab Navigation

Three levels — pick the one that fits:

| Need | How | Notes |
|------|-----|-------|
| Instant switch, no animation | `<AnimatedOutlet mode="switch" />` | Simplest |
| Switch with animation | `<AnimatedOutlet mode="switch" transition="slide" />` | Re-renders on every switch |
| **Switch with animation + state preserved** ✅ | `<KeepAlive mode="switch">` | Recommended for real apps |

### Route setup (works for all three options)

```tsx
// routes.tsx
{
  path: 'tabs',
  element: <TabsLayout />,
  children: [
    { path: 'home',     handle: { tabIndex: 0 }, element: <HomeTab /> },
    { path: 'discover', handle: { tabIndex: 1 }, element: <DiscoverTab /> },
    { path: 'profile',  handle: { tabIndex: 2 }, element: <ProfileTab /> },
  ],
}
```

> `tabIndex` tells `slide` / `cover` which direction to animate (lower → higher = right). Omit it and directional animations fall back to `fade`.

### TabsLayout — choose one of three patterns

```tsx
// TabsLayout.tsx
import { NavLink } from 'react-router-dom'
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'

export function TabsLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Content area — pick one: */}
      <main style={{ flex: 1, overflow: 'hidden' }}>

        {/* Option A: no animation */}
        <AnimatedOutlet mode="switch" />

        {/* Option B: animation, but tabs re-render on every switch */}
        <AnimatedOutlet mode="switch" transition="slide" />

        {/* Option C: animation + state preserved (recommended)
            Switching away keeps the tab alive in memory.
            State, scroll position, and DOM are restored instantly on return. */}
        <KeepAlive mode="switch">
          <AnimatedOutlet transition="slide" />
        </KeepAlive>

      </main>

      {/* Tab bar lives OUTSIDE the outlet — it never participates in transitions */}
      <nav style={{ display: 'flex', borderTop: '1px solid #eee' }}>
        <NavLink to="/tabs/home"     replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>Home</NavLink>
        <NavLink to="/tabs/discover" replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>Discover</NavLink>
        <NavLink to="/tabs/profile"  replace style={{ flex: 1, textAlign: 'center', padding: 12 }}>Profile</NavLink>
      </nav>

    </div>
  )
}
```

### Supported tab animations

| Animation | Effect | Requires `tabIndex` |
|-----------|--------|---------------------|
| *(none)* | Instant switch | No |
| `fade` | Cross-fade | No |
| `slide` | Directional left/right slide | **Yes** |
| `cover` | iOS-style directional cover | **Yes** |
| `scale` | Zoom | No |

---

## Keep-Alive

Wrap `<AnimatedOutlet>` with `<KeepAlive>` to preserve page state across navigations.  
Think of it as React Router's equivalent of Vue's `<KeepAlive><RouterView /></KeepAlive>`.

```tsx
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'
```

### Stack mode — list → detail → back

When the user drills into a detail page and comes back, the list page is **exactly as they left it** (scroll position, form state, everything):

```tsx
// ListLayout.tsx
<KeepAlive>
  <AnimatedOutlet transition="cover" />
</KeepAlive>
```

On PUSH: the list page stays alive in the background.  
On POP: the detail page exits with animation, the list page is instantly revealed.

### Switch mode — tab caching

All visited tabs are cached by pathname. Switching between tabs is instant and stateful:

```tsx
// TabsLayout.tsx
<KeepAlive mode="switch">
  <AnimatedOutlet transition="slide" />
</KeepAlive>
```

**Limit cache size (LRU eviction):**

```tsx
<KeepAlive mode="switch" max={10}>
  <AnimatedOutlet />
</KeepAlive>
```

When over `max`, the least-recently-used page is evicted. Default is 30, which covers most apps.

**Allow-list / deny-list:**

```tsx
// Cache only the 3 main tabs; all other pages are destroyed on exit
<KeepAlive mode="switch" include={['/tabs/home', '/tabs/discover', '/tabs/profile']}>
  <AnimatedOutlet />
</KeepAlive>

// Never cache payment or form pages (avoid stale data)
<KeepAlive mode="switch" exclude={['/checkout', '/payment']}>
  <AnimatedOutlet />
</KeepAlive>

// RegExp and predicate functions work too
<KeepAlive mode="switch" exclude={(path) => path.startsWith('/form')}>
  <AnimatedOutlet />
</KeepAlive>
```

`include` and `exclude` can be combined: a page is cached only if it passes `include` **and** does not match `exclude`.

### Imperative cache control (aliveRef)

Clear caches programmatically, for example on logout:

```tsx
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedOutlet, KeepAlive } from 'react-router-dom-animate'
import type { KeepAliveRef } from 'react-router-dom-animate'

function TabsLayout() {
  const navigate = useNavigate()
  const aliveRef = useRef<KeepAliveRef | undefined>(undefined)

  const handleLogout = () => {
    aliveRef.current?.removeAll()  // evict all inactive cached pages
    navigate('/login')
  }

  return (
    <>
      <KeepAlive mode="switch" aliveRef={aliveRef}>
        <AnimatedOutlet />
      </KeepAlive>
      <button onClick={handleLogout}>Logout</button>
    </>
  )
}
```

| Method | Description |
|--------|-------------|
| `remove(pathname)` | Evict one page by pathname; next visit remounts it |
| `removeAll()` | Evict all pages except the currently active one |
| `getCached()` | Returns all cached pathnames (LRU order, tail = most recent) |

**Debug tip — display live cache state (refreshes on every navigation):**

```tsx
function CachedBadge({ aliveRef }: { aliveRef: React.RefObject<KeepAliveRef | undefined> }) {
  useLocation() // re-render on every route change
  const cached = aliveRef.current?.getCached() ?? []
  return <div>Cached: {cached.join(', ') || '(empty)'}</div>
}
```

> **Performance tip**: If you pass an inline function to `include` or `exclude`
> (e.g. `exclude={(p) => p.includes('...')}`), a new function reference is created
> on every parent render. The library stores these in refs internally so the
> `<KeepAlive>` context stays stable, but it is still good practice to wrap
> long-lived filters with `useCallback` or extract them to module-level constants:
>
> ```tsx
> // ✅ Stable reference — recommended
> const isPaymentPage = useCallback((p: string) => p.startsWith('/payment'), [])
> <KeepAlive mode="switch" exclude={isPaymentPage}>
>
> // Also fine — internally wrapped in a ref, no context churn
> <KeepAlive mode="switch" exclude={(p) => p.startsWith('/payment')}>
> ```

### Lifecycle hooks

Components don't remount in keep-alive mode — use these hooks to react to page activation:

```tsx
import { useActivated, useDeactivated } from 'react-router-dom-animate'

function ProfilePage() {
  useActivated(() => {
    // runs every time the page becomes visible, including initial mount
    fetchLatestData()
  })

  useDeactivated(() => {
    // runs when the page is hidden or the keep-alive group unmounts
    cancelPendingRequests()
  })
}
```

| Hook | In keep-alive mode | Without keep-alive |
|------|--------------------|--------------------|
| `useActivated` | Fires each time the page becomes active (including initial mount) | Equivalent to `useEffect(() => cb(), [])` |
| `useDeactivated` | Fires when page is hidden or the group unmounts | Equivalent to `useEffect(() => () => cb(), [])` |

> **Note**: `<Activity>` hides pages via `display:none`. Browsers pause `<video>`/`<audio>` and may reload `<iframe>`. Use `useDeactivated` to save progress and `useActivated` to restore it.

---

## Props Reference

### `<AnimatedOutlet>`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `transition` | `string` | `'cover'` | Built-in: `cover` `slide` `fade` `scale` `modal` `none`; or a custom preset name |
| `mode` | `'stack' \| 'switch'` | `'stack'` | Without keep-alive: `stack` (directional) or `switch` (flat). Ignored inside `<KeepAlive>` |
| `className` | `string` | — | Added to the `.animated-outlet-group` wrapper |

### `<KeepAlive>`

Wraps `<AnimatedOutlet>` to enable page caching.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'stack' \| 'switch'` | `'stack'` | `stack`: background preservation for drill-down; `switch`: LRU cache for tabs |
| `max` | `number` | `30` | Max cached pages (LRU eviction). Switch mode only |
| `include` | `string[] \| RegExp \| (path) => boolean` | — | Allow-list: only matching pages are cached. Switch mode only |
| `exclude` | `string[] \| RegExp \| (path) => boolean` | — | Deny-list: matching pages are destroyed on exit. Switch mode only |
| `aliveRef` | `RefObject<KeepAliveRef>` | — | Imperative cache control handle. Switch mode only |

> **Alternative (stack mode only)**: Set `handle: { keepAlive: true }` on a route to enable stack keep-alive without wrapping with `<KeepAlive>`.

---

## Custom Animation Duration

### CSS variables (recommended)

```css
:root {
  --fr-duration: 300ms;        /* global duration (default: 300ms) */
  --fr-duration-modal: 450ms;  /* per-type override */
  --fr-duration-slide: 280ms;
}
```

Supported names: `--fr-duration-cover` `--fr-duration-slide` `--fr-duration-fade` `--fr-duration-scale` `--fr-duration-modal`

### JavaScript

```ts
import { setAnimDuration } from 'react-router-dom-animate'

setAnimDuration('modal', 450)  // overrides CSS variables
```

### Custom animation presets

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

// use it exactly like a built-in animation
<AnimatedOutlet transition="my-flip" />
navigate('/page', { state: { transition: 'my-flip' } })
```

---

## Demo

```bash
npm run demo   # http://localhost:5180
```

MIT

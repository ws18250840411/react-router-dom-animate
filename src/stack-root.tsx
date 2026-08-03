import {
  Activity,
  createRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  UNSAFE_LocationContext,
  useLocation,
  useMatches,
  useNavigationType,
  useNavigation,
  useOutlet,
} from 'react-router-dom'
import { CSSTransition } from 'react-transition-group'

import { groupClassName } from './common'
import { FrozenContext, LocationContextProvider, type LocCtxValue } from './context'
import {
  layoutRouteId,
  planTransition,
  sameLayoutPage,
  IDLE,
} from './transition'
import type { KeepAliveRef, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

// ===========================================================================
// Scroll handler cleanup helper
// ===========================================================================

type BgScrollHandlerEntry = {
  handler: (event: Event) => void
  clickHandler: () => void
  touchStartHandler: () => void
  touchEndHandler: () => void
  container: HTMLElement
}

/** Remove scroll + touch listeners added by BackgroundPreserveRoot, if any. */
export function detachBgScrollHandler(
  bgScrollHandlers: Map<string, BgScrollHandlerEntry>,
  bgFrozen: Map<string, boolean>,
  bgInteractionFrozen: Set<string>,
  bgNavigationFrozen: Set<string>,
  key: string,
): void {
  const entry = bgScrollHandlers.get(key)
  if (entry) {
    entry.container.removeEventListener('scroll', entry.handler, { capture: true })
    entry.container.removeEventListener('click', entry.clickHandler, { capture: true })
    entry.container.removeEventListener('touchstart', entry.touchStartHandler, { capture: true })
    entry.container.removeEventListener('touchend', entry.touchEndHandler, { capture: true })
    entry.container.removeEventListener('touchcancel', entry.touchEndHandler, { capture: true })
    bgScrollHandlers.delete(key)
  }
  bgFrozen.delete(key)
  bgInteractionFrozen.delete(key)
  bgNavigationFrozen.delete(key)
}

// ===========================================================================
// BackgroundPreserveRoot - stack mode (PUSH/POP with background preservation)
//
// Render-phase ref mutations: stackRef.current is updated during render based
// on location.key changes. This is safe because:
// 1. Mutations are idempotent (guarded by location.key !== lastToKeyRef checks)
// 2. forceRender is synchronous (useReducer), not wrapped in startTransition
// 3. These components are never inside Suspense boundaries (they are layouts)
// 4. React 19 Concurrent Mode only affects Suspense/startTransition/deferredValue
// ===========================================================================

type StackEntry = {
  locKey: string
  pathname: string
  // stableKey is derived from layoutRouteId (same for home/profile, different for article).
  // Used as the Activity React key so same-level navigations (tabs, REPLACE) don't
  // unmount the subtree — only the outlet/locCtx/locKey are updated in-place.
  stableKey: string
  outlet: ReactNode
  locCtx: LocCtxValue
  nodeRef: RefObject<HTMLDivElement | null>
  alive: boolean
  activityMode: 'visible' | 'hidden'
  // When true, skip the CSSTransition enter animation on POP restore.
  // The exiting page slides away on top (via DOM order); background reveals without animating.
  skipEnter?: boolean
}

function snapLocation(
  location: ReturnType<typeof useLocation>,
  matches: ReturnType<typeof useMatches>,
): RouteSnapshot {
  return {
    path: location.pathname,
    key: location.key,
    state: location.state,
    // Store reference directly - React Router creates a new matches array
    // per location change, so from/to never alias. Avoids O(n) copy per nav.
    matches,
  }
}

export function BackgroundPreserveRoot({
  depth: _depth,
  layoutTransition,
  max,
  onTransitionStart,
  onTransitionEnd,
  aliveRef,
  className,
}: {
  depth: number
  layoutTransition?: RouteAnimType
  max?: number
  onTransitionStart?: () => void
  onTransitionEnd?: () => void
  aliveRef?: RefObject<KeepAliveRef | null | undefined>
  className?: string
}) {
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const isFrozen = useContext(FrozenContext)
  const isPending = useNavigation().state !== 'idle'

  const onTSRef = useRef(onTransitionStart)
  onTSRef.current = onTransitionStart
  const onTERef = useRef(onTransitionEnd)
  onTERef.current = onTransitionEnd
  const fallback = layoutTransition ?? 'cover'
  const stackDepthLimit = max !== undefined && Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 10
  const pageKey = layoutRouteId(matches, location.pathname) ?? location.key

  const fromSnapRef = useRef<RouteSnapshot>(snapLocation(location, matches))
  const toSnapRef = useRef<RouteSnapshot>(snapLocation(location, matches))
  const lastToKeyRef = useRef(location.key)
  if (lastToKeyRef.current !== location.key) {
    // Capture "from" as the last destination before updating "to".
    // This ensures rapid A→B→A navigation (B animation interrupted) still
    // computes the correct B→A direction instead of treating it as A→A (IDLE).
    fromSnapRef.current = toSnapRef.current
    lastToKeyRef.current = location.key
    toSnapRef.current = snapLocation(location, matches)
  }
  const [settledLocation, setSettledLocation] = useState(location)
  const locationRef = useRef(location)
  locationRef.current = location
  const settledKeyRef = useRef(settledLocation.key)
  settledKeyRef.current = settledLocation.key
  const commitSettled = useCallback(() => {
    if (settledKeyRef.current !== locationRef.current.key) {
      setSettledLocation(locationRef.current)
      onTERef.current?.()
    }
  }, [])

  const activePlan: TransitionPlan = useMemo(() => {
    const fromSnap = fromSnapRef.current
    const toSnap = toSnapRef.current
    if (sameLayoutPage(fromSnap, toSnap)) return IDLE
    return planTransition(navType, fromSnap, toSnap, fallback)
  }, [navType, location.key, settledLocation.key, fallback])

  const timeout =
    activePlan.duration > 0 ? { enter: activePlan.duration, exit: activePlan.duration } : 0

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    onTSRef.current?.()
    if (activePlan.duration <= 0) {
      commitSettled()
      return
    }
    const timer = window.setTimeout(commitSettled, activePlan.duration + 50)
    return () => window.clearTimeout(timer)
  }, [location.key, activePlan.duration, settledLocation.key, commitSettled])

  // nodeRefsCache and bgScrollsRef are keyed by stableKey (stable across same-level nav).
  const nodeRefsCache = useRef(new Map<string, RefObject<HTMLDivElement | null>>())
  const getNodeRef = useCallback((key: string): RefObject<HTMLDivElement | null> => {
    if (!nodeRefsCache.current.has(key)) {
      nodeRefsCache.current.set(key, createRef<HTMLDivElement | null>())
    }
    return nodeRefsCache.current.get(key)!
  }, [])

  const stackRef = useRef<StackEntry[]>([])
  const [renderVersion, forceRender] = useReducer((n: number) => n + 1, 0)
  const pendingEnterRef = useRef(new Set<string>())

  // Scroll positions are tracked via capture-phase scroll listeners (keyed by stableKey).
  //
  // iOS-specific concern: momentum scroll continues on the compositor thread while the exit
  // animation plays (the outgoing page is still Activity-visible during the animation). This
  // can shift scrollTop from the user's intended position (877) to an intermediate value (310)
  // by the time the page is hidden — even though the user never scrolled to 310 intentionally.
  //
  // Solution: capture-phase touchstart fires synchronously before any React processing. iOS
  // stops momentum scroll the instant the user's finger touches the screen, so the scrollTop
  // at touchstart is the correct "intended" resting position. We snapshot bgScrollsRef at that
  // moment and freeze updates for 100 ms after touchend, giving the click/navigate event time
  // to fire before unfreezing. This ensures bgScrollsRef always holds the pre-navigation
  // position when a POP restoration runs.
  const bgScrollsRef = useRef(new Map<string, Array<[HTMLElement, number, number]>>())
  const bgScrollHandlersRef = useRef(new Map<string, BgScrollHandlerEntry>())
  const bgFrozenRef = useRef(new Map<string, boolean>())
  const bgInteractionFrozenRef = useRef(new Set<string>())
  // Once a page starts leaving, ignore browser-generated scroll events until it
  // is restored. Some engines reset descendant scrollTop when Activity applies
  // display:none; that reset must never overwrite the pre-navigation snapshot.
  const bgNavigationFrozenRef = useRef(new Set<string>())
  const pendingScrollRestoreRef = useRef(new Set<string>())

  // Imperative cache control for stack mode (aliveRef).
  useEffect(() => {
    if (!aliveRef) return
    aliveRef.current = {
      remove(pathname: string) {
        if (pathname === location.pathname) return
        const idx = stackRef.current.findIndex(e => e.pathname === pathname && e.alive)
        if (idx < 0) return
        const entry = stackRef.current[idx]
        detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, entry.stableKey)
        nodeRefsCache.current.delete(entry.stableKey)
        bgScrollsRef.current.delete(entry.stableKey)
        stackRef.current = stackRef.current.filter(e => e.stableKey !== entry.stableKey)
        forceRender()
      },
      removeAll() {
        const active = location.pathname
        for (const e of [...stackRef.current]) {
          if (e.pathname !== active && e.alive) {
            detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, e.stableKey)
            nodeRefsCache.current.delete(e.stableKey)
            bgScrollsRef.current.delete(e.stableKey)
          }
        }
        stackRef.current = stackRef.current.filter(e => e.pathname === active)
        forceRender()
      },
      getCached() {
        return stackRef.current.filter(e => e.alive).map(e => e.pathname)
      },
    }
    return () => { aliveRef.current = undefined }
  }, [aliveRef, location.pathname])

  const scrollRestoreFrameRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (scrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current)
    }
    // Detach all scroll/touch handlers on unmount to prevent stale listeners.
    for (const key of [...bgScrollHandlersRef.current.keys()]) {
      detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, key)
    }
  }, [])

  const locKey = location.key
  // stableKey groups same-level pages: combines layout route ID with path depth so that
  // home/profile (same depth) share one stableKey while list/detail (different depths) don't.
  // Used as the Activity React key — stable across same-level navigations (tabs, replace),
  // different for genuinely deeper pages (detail pushed on top of list).
  const stableKey = `${pageKey}_${location.pathname.split('/').filter(Boolean).length}`
  const topEntry = stackRef.current[stackRef.current.length - 1] as StackEntry | undefined

  if (!topEntry) {
    stackRef.current = [
      { locKey, pathname: location.pathname, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
    ]
  } else if (topEntry.locKey !== locKey) {
    if (navType === 'POP') {
      // Look up by locKey (browser history key), which was updated on each same-level nav.
      const stack = stackRef.current
      let bgIdx = -1
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].locKey === locKey) { bgIdx = i; break }
      }
      // Data-router loaders and redirects may replace a history entry while
      // preserving the same logical page. Fall back to the scoped page identity
      // so POP can still reactivate the existing Activity subtree.
      if (bgIdx < 0) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].stableKey === stableKey && stack[i].alive) { bgIdx = i; break }
        }
      }
      if (bgIdx >= 0) {
        const below = stackRef.current.slice(0, bgIdx)
        const poppedOff = stackRef.current.slice(bgIdx + 1).map(e => ({ ...e, alive: false }))
        const restored: StackEntry = { ...stackRef.current[bgIdx], outlet, locCtx, activityMode: 'visible', skipEnter: true }
        stackRef.current = [...below, ...poppedOff, restored]
        if (bgScrollsRef.current.has(restored.stableKey)) {
          pendingScrollRestoreRef.current.add(restored.stableKey)
        } else {
          bgNavigationFrozenRef.current.delete(restored.stableKey)
        }
      } else {
        // Target not found in back-stack. Reset — the Activity key (stableKey) may be the
        // same, so React will reconcile without unmounting if it matches.
        for (const e of stackRef.current) {
          detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, e.stableKey)
          nodeRefsCache.current.delete(e.stableKey)
          bgScrollsRef.current.delete(e.stableKey)
        }
        stackRef.current = [
          { locKey, pathname: location.pathname, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
        ]
      }
    } else if (topEntry.stableKey === stableKey) {
      // Same-level navigation (tabs REPLACE, sibling PUSH with same depth): same stableKey
      // means the Activity key won't change — no DOM unmount. Just update locKey/outlet/locCtx.
      stackRef.current = stackRef.current.map((e, i, arr) =>
        i === arr.length - 1 ? { ...e, locKey, outlet, locCtx } : e,
      )
    } else if (navType === 'PUSH') {
      if (!bgFrozenRef.current.get(topEntry.stableKey)) {
        const container = topEntry.nodeRef.current
        if (container) {
          const existing = bgScrollsRef.current.get(topEntry.stableKey)
          if (existing && existing.length > 0) {
            for (let i = existing.length - 1; i >= 0; i--) {
              const el = existing[i][0]
              if (!el.isConnected) { existing.splice(i, 1); continue }
              existing[i] = [el, el.scrollTop, el.scrollLeft]
            }
          } else {
            const scrolls: Array<[HTMLElement, number, number]> = []
            const elements = [container, ...container.querySelectorAll<HTMLElement>('*')]
            for (const element of elements) {
              if (element.scrollTop !== 0 || element.scrollLeft !== 0) {
                scrolls.push([element, element.scrollTop, element.scrollLeft])
              }
            }
            if (scrolls.length > 0) bgScrollsRef.current.set(topEntry.stableKey, scrolls)
          }
        }
      }
      bgNavigationFrozenRef.current.add(topEntry.stableKey)
      // Hide all entries below the current top during the animation.
      const updatedStack = stackRef.current.map((e, i, arr) =>
        i < arr.length - 1 ? { ...e, activityMode: 'hidden' as const } : e,
      )
      // Filter out zombie entries (alive=false) with the same stableKey.
      const deduped = updatedStack.filter(e => !(e.stableKey === stableKey && !e.alive))
      let newStack: StackEntry[] = [
        ...deduped,
        { locKey, pathname: location.pathname, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
      ]
      // Evict deepest entries when the stack exceeds the depth limit.
      if (newStack.length > stackDepthLimit) {
        const evicted = newStack.slice(0, newStack.length - stackDepthLimit)
        for (const e of evicted) {
          if (!e.alive) continue
          detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, e.stableKey)
          nodeRefsCache.current.delete(e.stableKey)
          bgScrollsRef.current.delete(e.stableKey)
        }
        newStack = newStack.slice(newStack.length - stackDepthLimit)
      }
      stackRef.current = newStack
      // Two-render trick: first paint with in={false} so CSSTransition starts in
      // "exited" state; useLayoutEffect then flips to in={true} to play the enter animation.
      pendingEnterRef.current.add(stableKey)
    } else {
      // REPLACE with a different stableKey: swap top entry.
      const replaced = stackRef.current[stackRef.current.length - 1]
      if (replaced) {
        detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, replaced.stableKey)
        nodeRefsCache.current.delete(replaced.stableKey)
        bgScrollsRef.current.delete(replaced.stableKey)
      }
      stackRef.current = [
        ...stackRef.current.slice(0, -1),
        { locKey, pathname: location.pathname, stableKey, outlet, locCtx, nodeRef: getNodeRef(stableKey), alive: true, activityMode: 'visible' },
      ]
      pendingEnterRef.current.add(stableKey)
    }
  } else if (!isFrozen) {
    // When frozen (inside an alive=false exiting entry), skip outlet/locCtx updates so
    // nested BackgroundPreserveRoots don't replace exiting content with the new route's outlet.
    stackRef.current = stackRef.current.map((e, i, arr) =>
      i === arr.length - 1 ? { ...e, outlet, locCtx } : e,
    )
  }

  // Attach/detach scroll + touch listeners for alive stack entries (capture phase, outside Activity).
  // Runs on every render so newly pushed entries get listeners immediately.
  useLayoutEffect(() => {
    nodeRefsCache.current.forEach((ref, key) => {
      const container = ref.current
      if (!container || bgScrollHandlersRef.current.has(key)) return

      const handler = (event: Event) => {
        if (bgFrozenRef.current.get(key) || bgInteractionFrozenRef.current.has(key) || bgNavigationFrozenRef.current.has(key)) return
        const el = event.target as HTMLElement | null
        if (!el) return
        let cache = bgScrollsRef.current.get(key)
        if (!cache) {
          if (el.scrollTop === 0 && el.scrollLeft === 0) return
          cache = []
          bgScrollsRef.current.set(key, cache)
        }
        const idx = cache.findIndex(([e]) => e === el)
        if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
          if (idx >= 0) {
            cache[idx] = [el, el.scrollTop, el.scrollLeft]
          } else {
            cache.push([el, el.scrollTop, el.scrollLeft])
          }
        } else if (idx >= 0) {
          cache.splice(idx, 1)
        }
      }
      const touchStartHandler = () => {
        // iOS stops momentum scroll at touchstart. Re-read the current position of every
        // already-tracked element and freeze so animation-phase momentum events can't
        // overwrite the correct value.
        const cache = bgScrollsRef.current.get(key)
        if (cache?.length) {
          for (let i = cache.length - 1; i >= 0; i--) {
            const el = cache[i][0]
            if (!el.isConnected) { cache.splice(i, 1); continue }
            cache[i] = [el, el.scrollTop, el.scrollLeft]
          }
          bgScrollsRef.current.set(key, cache.filter(([, t, l]) => t !== 0 || l !== 0))
        }
        bgFrozenRef.current.set(key, true)
      }
      const touchEndHandler = () => {
        window.setTimeout(() => bgFrozenRef.current.delete(key), 100)
      }
      const clickHandler = () => {
        bgInteractionFrozenRef.current.add(key)
        window.setTimeout(() => bgInteractionFrozenRef.current.delete(key), 0)
      }

      container.addEventListener('scroll', handler, { capture: true, passive: true })
      container.addEventListener('click', clickHandler, { capture: true })
      container.addEventListener('touchstart', touchStartHandler, { capture: true, passive: true })
      container.addEventListener('touchend', touchEndHandler, { capture: true, passive: true })
      container.addEventListener('touchcancel', touchEndHandler, { capture: true, passive: true })
      bgScrollHandlersRef.current.set(key, { handler, clickHandler, touchStartHandler, touchEndHandler, container })
    })
    // Detach listeners for entries that are no longer in the cache.
    bgScrollHandlersRef.current.forEach((_, key) => {
      if (!nodeRefsCache.current.has(key)) {
        detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, key)
      }
    })
  }, [renderVersion])

  // No dependency array: must run after every render to check pendingEnterRef.
  // Adding [renderVersion] would create a deadlock: this effect calls forceRender
  // to increment renderVersion, but if it doesn't run, renderVersion never changes.
  useLayoutEffect(() => {
    if (pendingEnterRef.current.size > 0) {
      pendingEnterRef.current.clear()
      forceRender()
    }
    if (pendingScrollRestoreRef.current.size > 0) {
      pendingScrollRestoreRef.current.forEach((sk) => {
        const saved = bgScrollsRef.current.get(sk)
        const container = nodeRefsCache.current.get(sk)?.current
        if (saved && container) {
          const restore = () => {
            for (const [el, top, left] of saved) {
              if (!el.isConnected) continue
              el.scrollTop = top
              el.scrollLeft = left
            }
          }
          restore()
          if (scrollRestoreFrameRef.current !== null) {
            window.cancelAnimationFrame(scrollRestoreFrameRef.current)
          }
          scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
            scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
              scrollRestoreFrameRef.current = null
              const current = stackRef.current[stackRef.current.length - 1]
              if (current?.stableKey === sk && current.activityMode === 'visible') restore()
            })
          })
        }
        bgNavigationFrozenRef.current.delete(sk)
      })
      pendingScrollRestoreRef.current.clear()
    }
  })

  // Render exiting entries (alive=false) last so they paint on top of the restored
  // background page in the correct stacking order — no z-index hacks required.
  const logicalStack = stackRef.current
  const renderStack = [...logicalStack].sort((a, b) => {
    if (a.alive === b.alive) return 0
    return a.alive ? -1 : 1
  })

  return (
    <div className={groupClassName(className)} data-pending={isPending || undefined}>
      {renderStack.map((entry) => {
        const logicalIdx = logicalStack.indexOf(entry)
        const isTop = logicalIdx === logicalStack.length - 1
        const isSecond = logicalIdx === logicalStack.length - 2
        // Restored background entries (POP) appear immediately via timeout=0.
        const skipEnter = isTop && entry.skipEnter === true
        const entryTimeout = skipEnter ? 0 : (isTop || isSecond ? timeout : 0)
        const entryClassNames = skipEnter ? IDLE.classNames : (isTop || isSecond ? activePlan.classNames : IDLE.classNames)
        const inProp = isTop && !pendingEnterRef.current.has(entry.stableKey)
        return (
          <Activity key={entry.stableKey} mode={entry.activityMode}>
            <CSSTransition
              nodeRef={entry.nodeRef}
              in={inProp}
              timeout={entryTimeout}
              classNames={entryClassNames}
              mountOnEnter={false}
              unmountOnExit={!entry.alive}
              onExited={() => {
                // Look up the entry's current alive status from stackRef (not the render closure)
                // to avoid stale values when rapid navigation re-activates the page before its
                // exit animation finishes.
                const key = entry.stableKey
                const current = stackRef.current.find(e => e.stableKey === key)
                if (!current || !current.alive) {
                  detachBgScrollHandler(bgScrollHandlersRef.current, bgFrozenRef.current, bgInteractionFrozenRef.current, bgNavigationFrozenRef.current, key)
                  stackRef.current = stackRef.current.filter(e => e.stableKey !== key)
                  nodeRefsCache.current.delete(key)
                  bgScrollsRef.current.delete(key)
                  forceRender()
                } else {
                  // bgScrollsRef already has the correct pre-navigation position (captured at
                  // touchstart). Now just hide via Activity.
                  stackRef.current = stackRef.current.map(e =>
                    e.stableKey === key ? { ...e, activityMode: 'hidden' as const } : e,
                  )
                  forceRender()
                }
              }}
            >
              <div ref={entry.nodeRef} className="animated-outlet-page">
                {entry.alive ? (
                  <LocationContextProvider value={entry.locCtx}>
                    {entry.outlet}
                  </LocationContextProvider>
                ) : (
                  // Freeze outlet inside exiting entries so nested BackgroundPreserveRoots
                  // don't replace the exiting content with the new route's outlet.
                  <FrozenContext.Provider value={true}>
                    <LocationContextProvider value={entry.locCtx}>
                      {entry.outlet}
                    </LocationContextProvider>
                  </FrozenContext.Provider>
                )}
              </div>
            </CSSTransition>
          </Activity>
        )
      })}
    </div>
  )
}

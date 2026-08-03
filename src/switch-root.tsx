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

import { extractPreEnterClass, groupClassName } from './common'
import { LocationContextProvider, PageActiveContext, type LocCtxValue } from './context'
import { planTransition, IDLE } from './transition'
import type { KeepAliveFilter, KeepAliveRef, RouteAnimType, RouteSnapshot, TransitionPlan } from './types'

// ===========================================================================
// Filter & Scroll Utilities (switch-mode)
// ===========================================================================

function routeCacheName(matches: ReturnType<typeof useMatches>): string | undefined {
  for (let index = matches.length - 1; index >= 0; index--) {
    const name = (matches[index]?.handle as { keepAliveName?: unknown } | undefined)?.keepAliveName
    if (typeof name === 'string') return name
  }
  return undefined
}

/** Returns true if pathname or route cache name matches the given filter. */
function matchFilter(pathname: string, filter: KeepAliveFilter, cacheName?: string): boolean {
  if (filter instanceof RegExp) {
    // Clone without the global flag to avoid lastIndex statefulness.
    const re = new RegExp(filter.source, filter.flags.replace('g', ''))
    return re.test(pathname) || (cacheName !== undefined && re.test(cacheName))
  }
  if (typeof filter === 'function') return filter(pathname, cacheName)
  return filter.includes(pathname) || (cacheName !== undefined && filter.includes(cacheName))
}

/**
 * Returns true if the page at `pathname` should be kept in the Activity cache.
 * When `include` is set, only matching pages are cached.
 * When `exclude` is set, matching pages are discarded on exit.
 * If neither is set, all pages are cached.
 */
function shouldCache(
  pathname: string,
  include: KeepAliveFilter | undefined,
  exclude: KeepAliveFilter | undefined,
  cacheName?: string,
): boolean {
  if (include !== undefined && !matchFilter(pathname, include, cacheName)) return false
  if (exclude !== undefined && matchFilter(pathname, exclude, cacheName)) return false
  return true
}

/** Remove scroll listeners added by KeepAliveRoot, if any. */
function detachScrollHandler(
  scrollHandlers: Map<string, { handler: (event: Event) => void; container: HTMLElement }>,
  key: string,
): void {
  const entry = scrollHandlers.get(key)
  if (entry) {
    entry.container.removeEventListener('scroll', entry.handler, { capture: true })
    scrollHandlers.delete(key)
  }
}

// ===========================================================================
// KeepAliveRoot - switch mode (LRU tab cache with Activity)
//
// Same render-phase ref mutation pattern as BackgroundPreserveRoot.
// See safety notes in stack-root.tsx.
// ===========================================================================

function snapLocation(
  location: ReturnType<typeof useLocation>,
  matches: ReturnType<typeof useMatches>,
): RouteSnapshot {
  return {
    path: location.pathname,
    key: location.key,
    state: location.state,
    matches,
  }
}

type PageSnap = { outlet: ReactNode; locCtx: LocCtxValue; cacheName?: string }

export function KeepAliveRoot({
  max = 30,
  include,
  exclude,
  aliveRef,
  layoutTransition,
  onTransitionStart,
  onTransitionEnd,
  className,
}: {
  max?: number
  include?: KeepAliveFilter
  exclude?: KeepAliveFilter
  aliveRef?: RefObject<KeepAliveRef | null | undefined>
  layoutTransition?: RouteAnimType
  onTransitionStart?: () => void
  onTransitionEnd?: () => void
  className?: string
}) {
  const location = useLocation()
  const navType = useNavigationType()
  const matches = useMatches()
  const outlet = useOutlet()
  const locCtx = useContext(UNSAFE_LocationContext)
  const isPending = useNavigation().state !== 'idle'
  const pageKey = location.pathname
  const cacheLimit = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 30

  const snapshotsRef = useRef(new Map<string, PageSnap>())
  // Tail is most-recently-used (LRU order).
  const keysRef = useRef<string[]>([])
  const pageKeyRef = useRef(pageKey)
  pageKeyRef.current = pageKey
  const [renderVersion, forceRender] = useReducer((n: number) => n + 1, 0)

  // Per-page Activity mode (deferred to 'hidden' after exit animation finishes).
  const activityModesRef = useRef(new Map<string, 'visible' | 'hidden'>())
  // Per-page nodeRef for CSSTransition.
  const nodeRefsRef = useRef(new Map<string, RefObject<HTMLDivElement | null>>())
  const getKARNodeRef = useCallback((key: string): RefObject<HTMLDivElement | null> => {
    if (!nodeRefsRef.current.has(key)) {
      nodeRefsRef.current.set(key, createRef<HTMLDivElement | null>())
    }
    return nodeRefsRef.current.get(key)!
  }, [])
  // Two-render trick for enter animation.
  const pendingEnterRef = useRef(new Set<string>())

  const scrollCacheRef = useRef(new Map<string, Array<[HTMLElement, number, number]>>())
  // Stable scroll handler entries: created once per cached page, removed when evicted.
  // Declared here so it is available in the render-body LRU eviction loop.
  const scrollHandlersRef = useRef(new Map<string, { handler: (event: Event) => void; container: HTMLElement }>())

  // Compute transition plan (same logic as AnimatedRoot for switch mode).
  const fromSnapRef = useRef<RouteSnapshot>(snapLocation(location, matches))
  const toSnapRef = useRef<RouteSnapshot>(snapLocation(location, matches))
  const lastToKeyRef = useRef(location.key)
  if (lastToKeyRef.current !== location.key) {
    fromSnapRef.current = toSnapRef.current
    lastToKeyRef.current = location.key
    toSnapRef.current = snapLocation(location, matches)
  }
  const [settledLocation, setSettledLocation] = useState(location)
  const locationRef = useRef(location)
  locationRef.current = location
  const settledKeyRef = useRef(settledLocation.key)
  settledKeyRef.current = settledLocation.key
  const onTSRef = useRef(onTransitionStart)
  onTSRef.current = onTransitionStart
  const onTERef = useRef(onTransitionEnd)
  onTERef.current = onTransitionEnd
  const commitSettled = useCallback(() => {
    if (settledKeyRef.current !== locationRef.current.key) {
      setSettledLocation(locationRef.current)
      onTERef.current?.()
    }
  }, [])

  const fallback = layoutTransition ?? 'none'
  const activePlan: TransitionPlan = useMemo(() => {
    if (!layoutTransition) return IDLE
    const fromSnap = fromSnapRef.current
    const toSnap = toSnapRef.current
    // Treat all switch navigations as REPLACE (no stack history).
    const effectiveNav = navType === 'PUSH' && fromSnap.path !== toSnap.path ? 'REPLACE' : navType
    return planTransition(effectiveNav, fromSnap, toSnap, fallback, { tabs: true })
  }, [layoutTransition, navType, location.key, settledLocation.key, fallback])

  const timeout =
    activePlan.duration > 0 ? { enter: activePlan.duration, exit: activePlan.duration } : 0

  useLayoutEffect(() => {
    if (settledLocation.key === location.key) return
    onTSRef.current?.()
    if (activePlan.duration <= 0) {
      // Always sync settledLocation even when same pathname (different key).
      // Skipping this caused fromSnapRef to go stale after rapid A→B→A navigation,
      // which in turn produced wrong animation directions on subsequent navigations.
      commitSettled()
      return
    }
    const timer = window.setTimeout(commitSettled, activePlan.duration + 50)
    return () => window.clearTimeout(timer)
  }, [location.key, activePlan.duration, settledLocation.key, commitSettled])

  snapshotsRef.current.set(pageKey, { outlet, locCtx, cacheName: routeCacheName(matches) })

  // Track whether the active page changed so we know when to apply the two-render trick.
  const prevPageKeyRef = useRef('')
  const isPageKeyChanged = prevPageKeyRef.current !== pageKey
  prevPageKeyRef.current = pageKey

  // Move current key to tail (most-recently-used).
  if (keysRef.current.includes(pageKey)) {
    keysRef.current = keysRef.current.filter((k) => k !== pageKey)
  }
  keysRef.current = [...keysRef.current, pageKey]

  // Make the new page Activity visible immediately (needed before enter animation).
  activityModesRef.current.set(pageKey, 'visible')

  if (isPageKeyChanged) {
    // Two-render trick: start with in=false so CSSTransition starts in "exited" state.
    pendingEnterRef.current.add(pageKey)
  }

  if (keysRef.current.length > cacheLimit) {
    const evicted = keysRef.current.slice(0, keysRef.current.length - cacheLimit)
    keysRef.current = keysRef.current.slice(keysRef.current.length - cacheLimit)
    for (const k of evicted) {
      snapshotsRef.current.delete(k)
      scrollCacheRef.current.delete(k)
      activityModesRef.current.delete(k)
      nodeRefsRef.current.delete(k)
      detachScrollHandler(scrollHandlersRef.current, k)
    }
  }

  // Capture-phase scroll listener management.
  useLayoutEffect(() => {
    // Attach listeners for newly added pages.
    nodeRefsRef.current.forEach((ref, key) => {
      const container = ref.current
      if (!container || scrollHandlersRef.current.has(key)) return
      const handler = (event: Event) => {
        const el = event.target as HTMLElement | null
        if (!el) return
        let cache = scrollCacheRef.current.get(key)
        if (!cache) {
          if (el.scrollTop === 0 && el.scrollLeft === 0) return
          cache = []
          scrollCacheRef.current.set(key, cache)
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
      container.addEventListener('scroll', handler, { capture: true, passive: true })
      scrollHandlersRef.current.set(key, { handler, container })
    })
    // Detach listeners for any remaining evicted pages (safety net).
    scrollHandlersRef.current.forEach(({ handler, container }, key) => {
      if (!nodeRefsRef.current.has(key)) {
        container.removeEventListener('scroll', handler, { capture: true })
        scrollHandlersRef.current.delete(key)
      }
    })
  }, [renderVersion])

  // Restore scroll after Activity removes display:none.
  useLayoutEffect(() => {
    const saved = scrollCacheRef.current.get(pageKey)
    if (saved?.length) {
      for (const [el, top, left] of saved) {
        if (el.isConnected) {
          el.scrollTop = top
          el.scrollLeft = left
        }
      }
    }
  }, [pageKey])

  // Two-render trick: flip pendingEnter → triggers enter animation.
  useLayoutEffect(() => {
    if (pendingEnterRef.current.size > 0) {
      pendingEnterRef.current.clear()
      forceRender()
    }
  })

  // Rapid-nav cleanup: when an animation is interrupted (duration=0, e.g. rapid A→B→A),
  // immediately hide all non-active pages that are still visible. This prevents the
  // one-frame flash that occurs when CSSTransition removes animation classes from an
  // interrupted page, causing it to snap back to position 0 before Activity hides it.
  // No dependency array: depends on forceRender from pendingEnter effect above.
  useLayoutEffect(() => {
    if (activePlan.duration > 0) return
    let changed = false
    activityModesRef.current.forEach((mode, key) => {
      if (key !== pageKey && mode === 'visible') {
        if (!shouldCache(key, include, exclude, snapshotsRef.current.get(key)?.cacheName)) {
          detachScrollHandler(scrollHandlersRef.current, key)
          keysRef.current = keysRef.current.filter((k) => k !== key)
          snapshotsRef.current.delete(key)
          scrollCacheRef.current.delete(key)
          activityModesRef.current.delete(key)
          nodeRefsRef.current.delete(key)
        } else {
          activityModesRef.current.set(key, 'hidden')
        }
        changed = true
      }
    })
    if (changed) forceRender()
  })

  // Detach all scroll handlers on unmount to prevent stale listeners.
  useEffect(() => () => {
    for (const key of [...scrollHandlersRef.current.keys()]) {
      detachScrollHandler(scrollHandlersRef.current, key)
    }
  }, [])

  useLayoutEffect(() => {
    if (!aliveRef) return
    aliveRef.current = {
      remove(pathname) {
        if (pathname === pageKeyRef.current) return
        detachScrollHandler(scrollHandlersRef.current, pathname)
        snapshotsRef.current.delete(pathname)
        keysRef.current = keysRef.current.filter((k) => k !== pathname)
        scrollCacheRef.current.delete(pathname)
        activityModesRef.current.delete(pathname)
        nodeRefsRef.current.delete(pathname)
        forceRender()
      },
      removeAll() {
        const active = pageKeyRef.current
        for (const k of [...keysRef.current]) {
          if (k !== active) {
            detachScrollHandler(scrollHandlersRef.current, k)
            snapshotsRef.current.delete(k)
            scrollCacheRef.current.delete(k)
            activityModesRef.current.delete(k)
            nodeRefsRef.current.delete(k)
          }
        }
        keysRef.current = keysRef.current.filter((k) => k === active)
        forceRender()
      },
      getCached() {
        return [...keysRef.current]
      },
    }
    return () => {
      aliveRef.current = undefined
    }
  }, [aliveRef])

  return (
    <div className={groupClassName(className)} data-pending={isPending || undefined}>
      {keysRef.current.map((key) => {
        const pageSnap = snapshotsRef.current.get(key)!
        const isActive = key === pageKey
        const activityMode = activityModesRef.current.get(key) ?? 'visible'
        const nodeRef = getKARNodeRef(key)
        // First paint of new page uses in=false; useLayoutEffect flips to in=true.
        const isPendingEnter = pendingEnterRef.current.has(key)
        const inProp = isActive && !isPendingEnter
        // While a page is pending its enter animation (in=false), apply the pre-enter position
        // class from classNames.enter so it starts off-screen (e.g. translate3d(100%, 0, 0)).
        // This prevents the one-frame flash at position 0 before the animation begins.
        const preEnterClass = isPendingEnter ? extractPreEnterClass(activePlan.classNames.enter) : ''
        return (
          <Activity key={key} mode={activityMode}>
            <CSSTransition
              nodeRef={nodeRef}
              in={inProp}
              timeout={timeout}
              classNames={activePlan.classNames}
              mountOnEnter={false}
              unmountOnExit={false}
              onExited={() => {
                // Use ref instead of closure `isActive` to avoid stale value when the
                // page becomes active again before its exit animation finishes.
                if (key !== pageKeyRef.current) {
                  // Guard: if key was already removed (e.g. by aliveRef.remove() called while
                  // the exit animation was still running), skip to avoid an orphaned entry.
                  if (!keysRef.current.includes(key)) return
                  if (!shouldCache(key, include, exclude, snapshotsRef.current.get(key)?.cacheName)) {
                    // Non-cacheable: remove entirely so next visit re-mounts fresh.
                    detachScrollHandler(scrollHandlersRef.current, key)
                    keysRef.current = keysRef.current.filter((k) => k !== key)
                    snapshotsRef.current.delete(key)
                    scrollCacheRef.current.delete(key)
                    activityModesRef.current.delete(key)
                    nodeRefsRef.current.delete(key)
                  } else {
                    // Delay Activity hidden until after exit animation to avoid display:none clipping.
                    activityModesRef.current.set(key, 'hidden')
                  }
                  forceRender()
                }
              }}
            >
              <div ref={nodeRef} className={preEnterClass ? `animated-outlet-page ${preEnterClass}` : 'animated-outlet-page'}>
                <PageActiveContext.Provider value={pageKey}>
                  <LocationContextProvider value={pageSnap.locCtx}>
                    {pageSnap.outlet}
                  </LocationContextProvider>
                </PageActiveContext.Provider>
              </div>
            </CSSTransition>
          </Activity>
        )
      })}
    </div>
  )
}

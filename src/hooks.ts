import { useContext, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

import { PageActiveContext } from './context'

// ===========================================================================
// usePageActive (internal)
// ===========================================================================

function usePageActive(): boolean {
  const activeKey = useContext(PageActiveContext)
  const { pathname } = useLocation()
  if (activeKey === null) return true
  return activeKey === pathname
}

// ===========================================================================
// useActivated / useDeactivated (public)
// ===========================================================================

/**
 * Fires every time the page becomes active, including on initial mount.
 * Deferred to a microtask so it always runs asynchronously, consistent with `useDeactivated`.
 * StrictMode safe: the re-mount cancels the pending microtask before it fires.
 */
export function useActivated(callback: () => void): void {
  const isActive = usePageActive()
  const cbRef = useRef(callback)
  cbRef.current = callback
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    cancelRef.current?.()
    cancelRef.current = null

    if (!isActive) return

    let cancelled = false
    const cancel = () => { cancelled = true }
    cancelRef.current = cancel
    Promise.resolve().then(() => { if (!cancelled) cbRef.current() })
    return () => {
      cancel()
      if (cancelRef.current === cancel) cancelRef.current = null
    }
  }, [isActive])
}

/**
 * Fires every time the page is deactivated (tab switch or unmount).
 * Outside keepAlive: equivalent to a `useEffect` cleanup.
 * StrictMode safe: the re-mount cancels any pending microtask before it fires.
 */
export function useDeactivated(callback: () => void): void {
  const isInKeepAlive = useContext(PageActiveContext) !== null
  const isActive = usePageActive()
  const cbRef = useRef(callback)
  cbRef.current = callback
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Cancel any pending microtask from a previous run (StrictMode double-invoke
    // or rapid navigation). This prevents stale callbacks from firing.
    cancelRef.current?.()
    cancelRef.current = null

    // Branch 1 - Outside keepAlive: behave like a normal useEffect cleanup.
    // The callback fires on unmount.
    if (!isInKeepAlive) return () => { cbRef.current() }

    // Branch 2 - Inside keepAlive, page just became inactive (isActive true→false).
    // The previous effect's cleanup (branch 3) scheduled a microtask, but we just
    // cancelled it above. Fire synchronously so the callback is not lost.
    if (!isActive) {
      cbRef.current()
      return
    }

    // Branch 3 - Inside keepAlive, page is active. Register a cleanup that
    // fires when isActive changes true→false. Microtask deferral keeps it
    // consistent with useActivated and StrictMode-safe.
    return () => {
      let cancelled = false
      cancelRef.current = () => { cancelled = true }
      Promise.resolve().then(() => { if (!cancelled) cbRef.current() })
    }
  }, [isActive, isInKeepAlive])
}

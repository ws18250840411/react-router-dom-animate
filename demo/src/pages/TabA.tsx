import { useRef } from 'react'

export function TabA() {
  const renders = useRef(0)
  renders.current += 1

  return (
    <div className="page" data-testid="tab-a-page" data-render-count={renders.current}>
      <h1>Tab A</h1>
    </div>
  )
}

import { useRef } from 'react'

export function TabB() {
  const renders = useRef(0)
  renders.current += 1

  return (
    <div className="page" data-testid="tab-b-page" data-render-count={renders.current}>
      <h1>Tab B</h1>
    </div>
  )
}

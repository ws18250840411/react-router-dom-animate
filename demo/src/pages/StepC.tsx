import { useAnimatedNavigate } from 'react-router-dom-animate'

export function StepC() {
  const navigate = useAnimatedNavigate()
  return (
    <div className="page" data-testid="step-c-page">
      <button type="button" className="back" data-testid="back" onClick={() => navigate.back()}>← 返回</button>
      <h1>Step C</h1>
    </div>
  )
}

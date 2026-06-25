import { useAnimatedNavigate } from 'react-router-dom-animate'

export function StepB() {
  const navigate = useAnimatedNavigate()
  return (
    <div className="page" data-testid="step-b-page">
      <button type="button" className="back" data-testid="back" onClick={() => navigate.back()}>← 返回</button>
      <h1>Step B</h1>
    </div>
  )
}

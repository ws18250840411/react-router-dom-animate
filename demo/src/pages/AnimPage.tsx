import { useLocation, useNavigate } from 'react-router-dom'

type AnimPageProps = {
  title: string
  testId: string
  transitionOverride?: string
}

export function AnimPage({ title, testId, transitionOverride }: AnimPageProps) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const fromState = (state as { transition?: string } | null)?.transition
  const transition = transitionOverride ?? fromState ?? 'cover'

  return (
    <div className="page" data-testid={testId}>
      <button type="button" className="back" data-testid="back" onClick={() => navigate(-1)}>
        ← 返回
      </button>
      <h1>{title}</h1>
      <p data-testid={`${testId}-transition`}>
        transition: <strong>{transition}</strong>
      </p>
    </div>
  )
}

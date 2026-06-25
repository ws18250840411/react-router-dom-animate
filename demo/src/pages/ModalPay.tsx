import { useNavigate } from 'react-router-dom'

export function ModalPay() {
  const navigate = useNavigate()

  return (
    <div className="modal-shell" data-testid="modal-page">
      <div className="modal-scrim" aria-hidden />
      <div className="modal-sheet page">
        <button type="button" className="back" data-testid="back" onClick={() => navigate(-1)}>
          ← 关闭
        </button>
        <h1>Modal</h1>
      </div>
    </div>
  )
}

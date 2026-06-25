import { useAnimatedNavigate } from 'react-router-dom-animate'

export function ModalPay() {
  const navigate = useAnimatedNavigate()

  return (
    <div className="modal-shell" data-testid="modal-page">
      <div className="modal-scrim" aria-hidden />
      <div className="modal-sheet page">
        <button type="button" className="back" data-testid="back" onClick={() => navigate.back()}>
          ← 关闭
        </button>
        <h1>Modal</h1>
      </div>
    </div>
  )
}

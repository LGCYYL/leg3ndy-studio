import type { ModalState } from '../types';

interface ModalProps {
  modal: ModalState | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function Modal({ modal, onClose, onConfirm }: ModalProps) {
  if (!modal) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{modal.title}</h3>
        <p>{modal.message}</p>
        <div className="modal-actions">
          {modal.variant === 'confirm' ? (
            <>
              <button type="button" className="btn-add modal-btn" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="btn-primary modal-btn" onClick={onConfirm}>
                Confirmar
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary modal-btn" onClick={onClose}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

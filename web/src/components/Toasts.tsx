import type { Toast } from '../flashcards/useToasts'

/**
 * The toast stack (issue #189's prototype parity pass). Not a live region
 * itself — every message here is already announced through the view's
 * shared LiveRegion, and duplicating it would make a screen reader say each
 * confirmation twice.
 */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              className="toast__undo"
              onClick={() => {
                toast.onUndo?.()
                onDismiss(toast.id)
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

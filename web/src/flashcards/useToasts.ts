import { useCallback, useRef, useState } from 'react'

export interface Toast {
  id: number
  message: string
  /** When present, the toast offers an Undo button and lingers longer. */
  onUndo?: () => void
}

/** An undoable toast stays up long enough to notice and act on; a plain confirmation doesn't need to. */
const UNDOABLE_MS = 5200
const PLAIN_MS = 2600

export interface Toasts {
  toasts: Toast[]
  push: (message: string, onUndo?: () => void) => void
  dismiss: (id: number) => void
}

/**
 * Transient confirmations for actions that change the table or the library
 * (issue #189's prototype parity pass). Anything destructive — deleting a
 * deck, replacing the table by loading a group — passes an `onUndo`, so the
 * confirmation doubles as the way back. That's why deck deletion doesn't
 * need a blocking "are you sure": the action is reversible for as long as
 * the toast is up.
 *
 * The same message is also announced through the aria-live region by the
 * caller, so this is a visual echo rather than the only notice.
 */
export function useToasts(): Toasts {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, onUndo?: () => void) => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, onUndo }])
      window.setTimeout(() => dismiss(id), onUndo ? UNDOABLE_MS : PLAIN_MS)
    },
    [dismiss],
  )

  return { toasts, push, dismiss }
}

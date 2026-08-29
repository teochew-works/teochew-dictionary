/** A shared aria-live region for drag-and-drop and keyboard-reorder announcements — see decks/dnd/useKeyboardReorder.ts. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {message}
    </div>
  )
}

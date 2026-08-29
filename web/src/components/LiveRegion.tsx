/** A shared aria-live region for drag and keyboard-lift announcements — see decks/dnd/useDeckDrag.ts and useDeckLift.ts. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {message}
    </div>
  )
}

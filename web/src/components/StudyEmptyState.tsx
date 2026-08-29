/**
 * Why the study surface is empty, and the one control that fixes it.
 * "Nothing to review" and "your level filter excluded everything" need very
 * different responses from the reader, so each stage of the pipeline names
 * itself rather than sharing a generic message.
 */
export function StudyEmptyState({
  title,
  body,
  fixLabel,
  onFix,
}: {
  title: string
  body: string
  fixLabel?: string
  onFix?: () => void
}) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      <div className="empty__body">{body}</div>
      {fixLabel && onFix && (
        <button type="button" className="empty__fix" onClick={onFix}>
          {fixLabel}
        </button>
      )}
    </div>
  )
}

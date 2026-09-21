export function AudioAvailabilityControl({ audioOnly, fullAudioOnly, onChange }: {
  audioOnly: boolean
  fullAudioOnly: boolean
  onChange: (audioOnly: boolean, fullAudioOnly: boolean) => void
}) {
  return <label>Audio availability{' '}
    <select value={fullAudioOnly ? 'full' : audioOnly ? 'any' : 'all'}
      onChange={(event) => onChange(event.target.value !== 'all', event.target.value === 'full')}>
      <option value="all">All entries</option>
      <option value="any">Any audio</option>
      <option value="full">Fully recorded</option>
    </select>
  </label>
}

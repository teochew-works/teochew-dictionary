import { afterEach, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { usePreference } from './usePreference'
import { readAudioOnly, writeAudioOnly } from './audioOnly'
import { AudioAvailabilityControl } from '../components/AudioAvailabilityControl'

function Consumer() {
  const [enabled] = usePreference(readAudioOnly)
  return <output>{String(enabled)}</output>
}
afterEach(() => localStorage.clear())
it('updates every mounted reader after a preference write', () => {
  render(<><Consumer /><Consumer /></>)
  act(() => writeAudioOnly(true))
  expect(screen.getAllByText('true')).toHaveLength(2)
})
it('gives the legacy fully-recorded preference precedence', () => {
  render(<AudioAvailabilityControl audioOnly={false} fullAudioOnly={true} onChange={() => {}} />)
  expect(screen.getByLabelText('Audio availability')).toHaveValue('full')
})

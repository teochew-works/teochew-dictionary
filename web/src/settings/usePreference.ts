import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export const PREFERENCE_CHANGED = 'teochew:preference-changed'

/** Keep mounted preference consumers in sync with writes in this and other tabs. */
export function usePreference<T>(read: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(read)
  useEffect(() => {
    const refresh = () => setValue(read())
    window.addEventListener(PREFERENCE_CHANGED, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(PREFERENCE_CHANGED, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [read])
  return [value, setValue]
}

export function preferenceChanged(): void {
  window.dispatchEvent(new Event(PREFERENCE_CHANGED))
}

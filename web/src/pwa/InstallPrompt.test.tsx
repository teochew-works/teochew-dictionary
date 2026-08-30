import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InstallPrompt } from './InstallPrompt'

function stubUserAgent(ua: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua)
}

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

describe('InstallPrompt', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows nothing when not installable and not iOS Safari', () => {
    stubUserAgent(ANDROID_CHROME_UA) // installable in principle, but no beforeinstallprompt has fired
    const { container } = render(<InstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a real install button once the browser says the app is installable', async () => {
    stubUserAgent(ANDROID_CHROME_UA)
    render(<InstallPrompt />)

    const prompt = vi.fn().mockResolvedValue(undefined)
    const userChoice = Promise.resolve({ outcome: 'accepted' as const })
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: typeof prompt
      userChoice: typeof userChoice
    }
    event.prompt = prompt
    event.userChoice = userChoice
    act(() => window.dispatchEvent(event))

    const button = screen.getByRole('button', { name: 'Install app' })
    fireEvent.click(button)
    expect(prompt).toHaveBeenCalled()
    await userChoice
  })

  it('shows Share instructions on iOS Safari, which never fires beforeinstallprompt', () => {
    stubUserAgent(IOS_SAFARI_UA)
    render(<InstallPrompt />)
    expect(screen.getByText('Share')).toBeInTheDocument()
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
  })

  it('shows an installed message once appinstalled fires', () => {
    stubUserAgent(ANDROID_CHROME_UA)
    render(<InstallPrompt />)
    act(() => window.dispatchEvent(new Event('appinstalled')))
    expect(screen.getByText(/Installed/)).toBeInTheDocument()
  })
})

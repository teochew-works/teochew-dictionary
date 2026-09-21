import { Component, type ReactNode } from 'react'

/** A deployment can replace an old page's lazy chunk before it is requested. */
export class ViewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() {
    if (this.state.failed) return <section className="app__status" role="alert">
      <h2>This view could not load</h2>
      <p>Check your connection and reload to get the latest version. Saved decks and review history stay in this browser.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload app</button>
    </section>
    return this.props.children
  }
}

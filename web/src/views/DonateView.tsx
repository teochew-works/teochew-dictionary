import './DonateView.css'

const PLATFORMS = [
  {
    name: 'GitHub Sponsors',
    url: 'https://github.com/sponsors/newhoggy',
    description: 'One-off or recurring, no platform fee — goes straight to the maintainer.',
  },
  {
    name: 'Ko-fi',
    url: 'https://ko-fi.com/johnky',
    description: 'A one-off "buy me a coffee" style tip.',
  },
  {
    name: 'Liberapay',
    url: 'https://liberapay.com/johnky',
    description: 'Recurring donations, run by a non-profit with no platform fee.',
  },
]

export function DonateView() {
  return (
    <div className="donate-view">
      <h2>Donate</h2>
      <p className="donate-view__hint">
        This dictionary is free and ad-free. If it's useful to you, donations help cover hosting and
        the time spent recording audio, checking entries, and building the tooling.
      </p>

      <ul className="donate-view__platforms">
        {PLATFORMS.map(({ name, url, description }) => (
          <li key={name} className="donate-view__platform">
            <a href={url} target="_blank" rel="noopener noreferrer" className="donate-view__link">
              {name}
            </a>
            <p className="donate-view__description">{description}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

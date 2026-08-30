import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DonateView } from './DonateView'

describe('DonateView', () => {
  afterEach(() => {
    cleanup()
  })

  it('links to GitHub Sponsors, Ko-fi, and Liberapay', () => {
    render(<DonateView />)
    expect(screen.getByRole('link', { name: 'GitHub Sponsors' })).toHaveAttribute(
      'href',
      'https://github.com/sponsors/newhoggy',
    )
    expect(screen.getByRole('link', { name: 'Ko-fi' })).toHaveAttribute('href', 'https://ko-fi.com/johnky')
    expect(screen.getByRole('link', { name: 'Liberapay' })).toHaveAttribute(
      'href',
      'https://liberapay.com/johnky',
    )
  })

  it('opens donation links in a new tab safely', () => {
    render(<DonateView />)
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})

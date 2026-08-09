import { afterEach, describe, expect, it, vi } from 'vitest'

describe('photos', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns null when no Unsplash key is configured', async () => {
    vi.stubEnv('VITE_UNSPLASH_KEY', '')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { fetchBackgroundPhoto } = await import('./photos')
    const result = await fetchBackgroundPhoto()

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tries fallback queries and returns the first valid photo URL', async () => {
    vi.stubEnv('VITE_UNSPLASH_KEY', 'demo-key')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ urls: { regular: 'https://img.example/hero.jpg' } }] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { fetchBackgroundPhoto } = await import('./photos')
    const result = await fetchBackgroundPhoto()

    expect(result).toBe('https://img.example/hero.jpg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

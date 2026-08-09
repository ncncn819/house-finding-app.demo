import { afterEach, describe, expect, it, vi } from 'vitest'

describe('tfl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns per-area commute times and falls back to null on API failure', async () => {
    vi.stubEnv('VITE_TFL_KEY', 'demo-key')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ journeys: [{ duration: 30 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ journeys: [{ duration: 45 }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ journeys: [{ duration: 50 }] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { fetchAllCommuteTimes } = await import('./tfl')
    const result = await fetchAllCommuteTimes('EC1A 1BB', [
      { id: 'camden', postcode: 'NW1 8NH' },
      { id: 'hackney', postcode: 'E8 3QA' },
    ])

    expect(result).toEqual({
      camden: { transit: 30, car: 45 },
      hackney: { transit: null, car: 50 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

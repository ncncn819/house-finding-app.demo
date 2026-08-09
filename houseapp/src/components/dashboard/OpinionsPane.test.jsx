import { describe, expect, it, vi } from 'vitest'
import { buildOpinionRows, postOpinion } from './opinions'

describe('OpinionsPane helpers', () => {
  it('maps each opinion into a render row with author and content', () => {
    const rows = buildOpinionRows([
      {
        id: '1',
        author_name: 'Becky',
        author_color: '#E76F51',
        content: 'The flow is clear.',
        created_at: '2026-04-19T20:00:00Z',
      },
      {
        id: '2',
        author_name: 'Sam',
        author_color: '#1A3528',
        content: 'Could use better loading feedback.',
        created_at: '2026-04-19T21:00:00Z',
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0].author).toBe('Becky')
    expect(rows[0].content).toBe('The flow is clear.')
    expect(rows[1].author).toBe('Sam')
    expect(rows[1].content).toBe('Could use better loading feedback.')
  })

  it('posts non-empty feedback to the session opinions endpoint with expected body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'op-1' }),
    })

    await postOpinion({
      apiBase: 'http://localhost:8000/api/v1',
      sessionCode: 'ABC123',
      authorName: 'Becky',
      authorColor: '#E76F51',
      content: 'Great app',
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/api/v1/sessions/ABC123/opinions')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body)).toEqual({
      author_name: 'Becky',
      author_color: '#E76F51',
      content: 'Great app',
    })
  })

  it('falls back to legacy opinions route when primary route returns endpoint 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Not Found' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'op-2' }),
      })

    await postOpinion({
      apiBase: 'http://localhost:8000/api/v1',
      sessionCode: 'ABC123',
      authorName: 'Becky',
      authorColor: '#E76F51',
      content: 'Fallback works',
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/sessions/ABC123/opinions')
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/api/v1/ABC123/opinions')
  })
})

export function formatRelativeTime(value) {
  if (!value) return ''

  const created = new Date(value).getTime()
  if (Number.isNaN(created)) return ''

  const diffMs = Date.now() - created
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function buildOpinionRows(opinions = []) {
  return opinions.map((item) => ({
    id: item.id,
    author: item.author_name,
    authorColor: item.author_color,
    content: item.content,
    relativeTime: formatRelativeTime(item.created_at),
  }))
}

export async function postOpinion({
  apiBase,
  sessionCode,
  authorName,
  authorColor,
  content,
  fetchImpl = fetch,
}) {
  const endpoints = [
    `${apiBase}/sessions/${sessionCode}/opinions`,
    `${apiBase}/${sessionCode}/opinions`,
  ]
  const requestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author_name: authorName,
      author_color: authorColor,
      content,
    }),
  }

  for (let i = 0; i < endpoints.length; i += 1) {
    const response = await fetchImpl(endpoints[i], requestInit)
    if (response.ok) return response.json()

    let detail = ''
    try {
      const body = await response.json()
      detail = body?.detail ? `: ${body.detail}` : ''
    } catch {
      // no-op: keep generic fallback below
    }

    // Route-level 404 fallback: support older/newer backend route shapes.
    if (response.status === 404 && detail === ': Not Found' && i < endpoints.length - 1) {
      continue
    }

    if (response.status === 404 && detail === ': Not Found') {
      throw new Error('Failed to post opinion (404): Not Found. Please restart backend and try again.')
    }

    throw new Error(`Failed to post opinion (${response.status})${detail}`)
  }

  throw new Error('Failed to post opinion. Please try again.')
}

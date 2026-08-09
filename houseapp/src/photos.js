const KEY = import.meta.env.VITE_UNSPLASH_KEY || ''

// Fetch a single photo URL for the app background
export async function fetchBackgroundPhoto() {
  if (!KEY) return null
  try {
    const queries = [
      'london city skyline sunset golden hour vibrant',
      'london thames tower bridge sunset',
      'london england aerial colorful',
    ]
    for (const q of queries) {
      const url = await searchPhoto(q)
      if (url) return url
    }
  } catch {}
  return null
}

async function searchPhoto(query) {
  const q = encodeURIComponent(query)
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape&client_id=${KEY}`
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.urls?.regular ?? null
}

// Returns { [areaId]: cdnUrl } or null if no key / all failed
export async function fetchAreaPhotos(areas) {
  if (!KEY) return null

  const results = {}
  await Promise.all(
    areas.map(async (area) => {
      try {
        // Try specific query first, fall back to simpler neighbourhood name
        let url = await searchPhoto(area.photoQuery)
        if (!url) url = await searchPhoto(`${area.name} london neighbourhood`)
        if (!url) url = await searchPhoto('london city street')
        if (url) results[area.id] = url
      } catch {
        // silently skip — gradient fallback used
      }
    })
  )
  return Object.keys(results).length > 0 ? results : null
}

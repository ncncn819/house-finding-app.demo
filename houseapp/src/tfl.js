const BASE = 'https://api.tfl.gov.uk'
const KEY  = import.meta.env.VITE_TFL_KEY || ''

const TRANSIT_MODES = 'tube,bus,overground,elizabeth-line,dlr,national-rail'

async function fetchJourneyMins(from, to, mode) {
  const modeStr = mode === 'transit' ? TRANSIT_MODES : 'driving'
  const params = new URLSearchParams({ journeyPreference: 'LeastTime', mode: modeStr })
  if (KEY) params.set('app_key', KEY)

  const url = `${BASE}/Journey/JourneyResults/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}?${params}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TfL ${res.status}`)
  const data = await res.json()
  const mins = data?.journeys?.[0]?.duration
  if (!mins) throw new Error('No journey found')
  return mins
}

// Returns { [areaId]: { transit: number|null, car: number|null } }
// null means the API call failed — caller should fall back to hardcoded values
export async function fetchAllCommuteTimes(fromPostcode, areas) {
  const results = {}
  await Promise.all(
    areas.map(async (area) => {
      const [transit, car] = await Promise.all([
        fetchJourneyMins(fromPostcode, area.postcode, 'transit').catch(() => null),
        fetchJourneyMins(fromPostcode, area.postcode, 'car').catch(() => null),
      ])
      results[area.id] = { transit, car }
    })
  )
  return results
}

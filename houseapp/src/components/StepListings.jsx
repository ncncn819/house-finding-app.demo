import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, MapPin, PoundSterling, Train, ExternalLink, Home, Sparkles,
  Clock, Shield, ShoppingCart, Building, Navigation,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import styles from './StepListings.module.css'
import ResidentialHotspotCard from './listings/ResidentialHotspotCard'
import TrendChart from './listings/TrendChart'

const API = 'http://localhost:8000/api/v1'

// ── Borough cost-of-living lookup (static) ─────────────────────────────────
const BOROUGH_COSTS = {
  'Southwark':      { band: 'Band C · ~£1,420/yr', pint: '£6.20', shops: "Lidl, Sainsbury's, M&S Food" },
  'Lambeth':        { band: 'Band C · ~£1,380/yr', pint: '£5.90', shops: 'Iceland, Tesco Metro, Aldi' },
  'Hackney':        { band: 'Band D · ~£1,550/yr', pint: '£6.50', shops: "Tesco Metro, Sainsbury's, Whole Foods" },
  'Waltham Forest': { band: 'Band C · ~£1,320/yr', pint: '£5.50', shops: 'Lidl, Asda, Co-op' },
  'Newham':         { band: 'Band C · ~£1,290/yr', pint: '£5.30', shops: 'Lidl, Tesco, Asda' },
  'Lewisham':       { band: 'Band C · ~£1,350/yr', pint: '£5.60', shops: 'Iceland, Tesco, Aldi' },
  'Wandsworth':     { band: 'Band D · ~£1,480/yr', pint: '£6.00', shops: "Waitrose, Sainsbury's, Co-op" },
  'Merton':         { band: 'Band D · ~£1,460/yr', pint: '£5.80', shops: 'Waitrose, Tesco, Lidl' },
  'Tower Hamlets':  { band: 'Band C · ~£1,310/yr', pint: '£6.00', shops: "Lidl, Sainsbury's, Co-op" },
  'Haringey':       { band: 'Band C · ~£1,395/yr', pint: '£5.70', shops: 'Lidl, Tesco, Morrisons' },
  'Greenwich':      { band: 'Band C · ~£1,360/yr', pint: '£5.50', shops: "Sainsbury's, Co-op, Lidl" },
  'Ealing':         { band: 'Band D · ~£1,440/yr', pint: '£5.80', shops: 'Waitrose, Tesco, M&S Simply Food' },
  'Hounslow':       { band: 'Band C · ~£1,350/yr', pint: '£5.40', shops: 'Lidl, Asda, Tesco' },
  'Islington':      { band: 'Band D · ~£1,600/yr', pint: '£6.80', shops: "Waitrose, M&S, Sainsbury's" },
  'Camden':         { band: 'Band E · ~£1,850/yr', pint: '£7.00', shops: 'Waitrose, M&S, Whole Foods' },
}
const DEFAULT_COST = { band: 'Band C/D · ~£1,400/yr', pint: '~£5.80', shops: 'Various supermarkets nearby' }

// ── Safety context labels ────────────────────────────────────────────────────
function getSafetyCtx(rate) {
  if (rate < 30)  return { label: 'Top 10% Safest in London',       color: '#006B3C', icon: '🛡️' }
  if (rate < 55)  return { label: 'Safer than London average',       color: '#22c55e', icon: '✅' }
  if (rate < 80)  return { label: 'Average urban activity',          color: '#B8960C', icon: '⚡' }
  if (rate < 110) return { label: 'Higher than average activity',    color: '#f97316', icon: '⚠️' }
  return           { label: 'High urban activity — stay aware',      color: '#CF142B', icon: '🚨' }
}

// ── Transport mode labels / colours ─────────────────────────────────────────
const MODE_COLOR = {
  walking:          '#6B7280',
  tube:             '#1D4ED8',
  bus:              '#CF142B',
  dlr:              '#00897B',
  'elizabeth-line': '#7C3AED',
  overground:       '#E05C00',
  'national-rail':  '#006B3C',
  cycle:            '#B8960C',
}
const MODE_LABEL = {
  walking:          'Walk',
  tube:             'Tube',
  bus:              'Bus',
  dlr:              'DLR',
  'elizabeth-line': 'Elizabeth Line',
  overground:       'Overground',
  'national-rail':  'National Rail',
  cycle:            'Cycle',
}

const TIME_OPTIONS = [
  { value: '0700', label: '7:00 AM' },
  { value: '0730', label: '7:30 AM' },
  { value: '0800', label: '8:00 AM' },
  { value: '0830', label: '8:30 AM' },
  { value: '0900', label: '9:00 AM' },
  { value: '1700', label: '5:00 PM' },
  { value: '1730', label: '5:30 PM' },
  { value: '1800', label: '6:00 PM' },
]

function buildCrimeFallbackSeries(crimeRate, years = 5) {
  const rate = Number(crimeRate)
  if (!Number.isFinite(rate) || rate <= 0) return []
  const currentYear = new Date().getFullYear()
  const startYear = currentYear - years + 1
  return Array.from({ length: years }, (_v, i) => {
    const ratio = years === 1 ? 1 : i / (years - 1)
    const value = rate * (1.04 - 0.04 * ratio)
    return {
      year: startYear + i,
      weighted_per_1k: Number(value.toFixed(2)),
      months_counted: 12,
    }
  })
}

function buildRentFallbackSeries(avgRent, years = 5) {
  const rent = Number(avgRent)
  if (!Number.isFinite(rent) || rent <= 0) return []
  const currentYear = new Date().getFullYear()
  const startYear = currentYear - years + 1
  const oldest = Math.round(rent * 0.93)
  const out = []
  for (let i = 0; i < years; i += 1) {
    const ratio = years === 1 ? 1 : i / (years - 1)
    const median = Math.round(oldest + (rent - oldest) * ratio)
    out.push({
      year: startYear + i,
      median_gbp: median,
      yoy_pct: null,
      release_period: `${startYear + i} (local estimate)`,
    })
  }
  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1].median_gbp
    const curr = out[i].median_gbp
    out[i].yoy_pct = prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(2)) : null
  }
  return out
}

const PLATFORMS = [
  {
    id: 'zoopla', label: 'Zoopla', color: '#7C3AED',
    url: n => `https://www.zoopla.co.uk/to-rent/property/london/?q=${encodeURIComponent(n + ', London')}&search_source=to-rent`,
  },
  {
    id: 'rightmove', label: 'Rightmove', color: '#00639B',
    url: n => `https://www.rightmove.co.uk/property-to-rent/find.html?searchType=RENT&locationIdentifier=REGION%5E87490&q=${encodeURIComponent(n)}`,
  },
  {
    id: 'openrent', label: 'OpenRent', color: '#E05C00',
    url: n => `https://www.openrent.co.uk/properties-to-rent/-london?term=${encodeURIComponent(n)}`,
  },
  {
    id: 'spareroom', label: 'SpareRoom', color: '#0E7490',
    url: n => `https://www.spareroom.co.uk/flatshare/london/${n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
  },
]

// ── Leaflet map (raw, no react-leaflet dep) ──────────────────────────────────
// StrictMode double-mounts and HMR can leave _leaflet_id on the container, so
// guard against re-init and swallow cleanup errors when the DOM is already gone.
function JourneyMap({ polyline, fromLat, fromLng, toLat, toLng }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)

  // Mount once: create the map. setView/route layers are handled in the data effect.
  useEffect(() => {
    const div = divRef.current
    if (!div || mapRef.current) return

    // If a previous (StrictMode-aborted) mount left state on the node, reset it.
    if (div._leaflet_id != null) {
      try { delete div._leaflet_id } catch { /* noop */ }
    }

    let map
    try {
      map = L.map(div, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17 }).addTo(map)
      L.control.attribution({ position: 'bottomright', prefix: '© OSM' }).addTo(map)
      // Default view; the data effect refines this with actual bounds.
      map.setView([51.5074, -0.1278], 11)
      mapRef.current = map
      // Tiles can render at 0×0 until the panel finishes its enter animation.
      setTimeout(() => { try { map.invalidateSize() } catch { /* noop */ } }, 250)
    } catch (err) {
      console.error('[JourneyMap] init failed', err)
      return
    }

    return () => {
      mapRef.current = null
      try { map.remove() } catch { /* node already gone */ }
    }
  }, [])

  // Update route layers + bounds whenever data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    try {
      // Remove old route layers
      map.eachLayer(layer => {
        if (layer._route || layer._heat) map.removeLayer(layer)
      })

      const tag = layer => { layer._route = true; layer.addTo(map); return layer }

      if (polyline && polyline.length > 1) {
        const line = tag(L.polyline(polyline, { color: '#1D4ED8', weight: 4, opacity: 0.85 }))
        map.fitBounds(line.getBounds(), { padding: [28, 28] })
      } else if (fromLat != null && toLat != null) {
        const line = tag(L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#1D4ED8', weight: 3, dashArray: '7 5', opacity: 0.55 }))
        map.fitBounds(line.getBounds(), { padding: [40, 40] })
      } else if (fromLat != null) {
        map.setView([fromLat, fromLng], 13)
      }

      if (fromLat != null)
        tag(L.circleMarker([fromLat, fromLng], { radius: 7, color: '#fff', fillColor: '#1A3528', fillOpacity: 1, weight: 2 }))
          .bindTooltip('This area', { permanent: false })
      if (toLat != null)
        tag(L.circleMarker([toLat, toLng], { radius: 7, color: '#fff', fillColor: '#CF142B', fillOpacity: 1, weight: 2 }))
          .bindTooltip('Your workplace', { permanent: false })

    } catch (err) {
      console.error('[JourneyMap] update failed', err)
    }
  }, [polyline, fromLat, fromLng, toLat, toLng])

  return <div ref={divRef} className={styles.map} />
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StepListings({
  location,
  postcode,
  commuteMode,
  direction,
  setDirection,
  departTime,
  setDepartTime,
  onBack,
  onOpenDashboard,
}) {
  const [journey, setJourney] = useState(null)
  const [journeyLoading, setJourneyLoading] = useState(false)
  const [workCoords, setWorkCoords] = useState(null)
  const [dashboardChoiceOpen, setDashboardChoiceOpen] = useState(false)
  const [residentialPoints, setResidentialPoints] = useState([])
  const [densityFeatures, setDensityFeatures] = useState(null)
  const [residentialLoading, setResidentialLoading] = useState(false)
  const [residentialError, setResidentialError] = useState('')
  const [crimeSeries, setCrimeSeries] = useState({ series: null, loading: true, error: '' })
  const [rentSeries, setRentSeries] = useState({ series: null, loading: true, error: '' })

  // Geocode the work postcode for the map destination marker
  useEffect(() => {
    if (!postcode) return
    const ac = new AbortController()
    fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, { signal: ac.signal })
      .then(r => r.json())
      .then(d => { if (d.result) setWorkCoords({ lat: d.result.latitude, lng: d.result.longitude }) })
      .catch(() => { /* aborted or network error */ })
    return () => ac.abort()
  }, [postcode])

  // Re-fetch the journey whenever any of these inputs change.
  // AbortController guards against setState-after-unmount when the user
  // navigates back mid-flight.
  useEffect(() => {
    if (!location.lat || !location.lng || !postcode) return
    const ac = new AbortController()
    setJourneyLoading(true)
    setJourney(null)
    const qs = new URLSearchParams({
      from_lat: location.lat,
      from_lng: location.lng,
      to_postcode: postcode,
      time: departTime,
      direction,
    })
    fetch(`${API}/commute/simulator?${qs}`, { signal: ac.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (ac.signal.aborted) return
        if (data) setJourney(data)
        setJourneyLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        console.error('[StepListings] journey fetch failed', err)
        setJourneyLoading(false)
      })
    return () => ac.abort()
  }, [location.lat, location.lng, postcode, departTime, direction])

  useEffect(() => {
    if (!location.lat || !location.lng) return
    const ac = new AbortController()
    setResidentialLoading(true)
    setResidentialError('')
    const qs = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      radius: '400',
    })
    fetch(`${API}/buildings/residential?${qs}`, { signal: ac.signal })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`buildings_${res.status}`))))
      .then(data => {
        if (ac.signal.aborted) return
        setResidentialPoints(Array.isArray(data?.points) ? data.points : [])
        setResidentialLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        setResidentialPoints([])
        setResidentialError('Residential hotspot data unavailable.')
        setResidentialLoading(false)
      })
    return () => ac.abort()
  }, [location.lat, location.lng])

  useEffect(() => {
    if (!location.lat || !location.lng) return
    const ac = new AbortController()
    setDensityFeatures(null)
    fetch(`${API}/density/oa?lat=${location.lat}&lng=${location.lng}&radius=400`, { signal: ac.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!ac.signal.aborted && data) setDensityFeatures(data)
      })
      .catch(() => { /* aborted or network */ })
    return () => ac.abort()
  }, [location.lat, location.lng])

  useEffect(() => {
    if (!location.lat || !location.lng) return
    const ac = new AbortController()
    setCrimeSeries({ series: null, loading: true, error: '' })
    const qs = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      years: '5',
    })
    fetch(`${API}/crime/yearly?${qs}`, { signal: ac.signal })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`crime_yearly_${res.status}`))))
      .then(data => {
        if (ac.signal.aborted) return
        const series = Array.isArray(data?.series) ? data.series : []
        if (series.length > 0) {
          setCrimeSeries({ series, loading: false, error: '' })
          return
        }
        const fallback = buildCrimeFallbackSeries(location.crimeRate)
        if (fallback.length > 0) {
          setCrimeSeries({ series: fallback, loading: false, error: '' })
          return
        }
        setCrimeSeries({ series: null, loading: false, error: 'Trend unavailable for this metric' })
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        const fallback = buildCrimeFallbackSeries(location.crimeRate)
        if (fallback.length > 0) {
          setCrimeSeries({ series: fallback, loading: false, error: '' })
          return
        }
        setCrimeSeries({ series: null, loading: false, error: 'Trend unavailable for this metric' })
      })
    return () => ac.abort()
  }, [location.lat, location.lng, location.crimeRate])

  useEffect(() => {
    if (!location.borough) {
      const fallback = buildRentFallbackSeries(location.avgRent)
      if (fallback.length > 0) {
        setRentSeries({ series: fallback, loading: false, error: '' })
      } else {
        setRentSeries({ series: null, loading: false, error: 'Trend unavailable for this metric' })
      }
      return
    }
    const ac = new AbortController()
    setRentSeries({ series: null, loading: true, error: '' })
    const qs = new URLSearchParams({
      borough: location.borough,
      years: '5',
    })
    fetch(`${API}/rent/yearly?${qs}`, { signal: ac.signal })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`rent_yearly_${res.status}`))))
      .then(data => {
        if (ac.signal.aborted) return
        const series = Array.isArray(data?.series) ? data.series : []
        if (series.length > 0) {
          setRentSeries({ series, loading: false, error: '' })
          return
        }
        const fallback = buildRentFallbackSeries(location.avgRent)
        if (fallback.length > 0) {
          setRentSeries({ series: fallback, loading: false, error: '' })
          return
        }
        setRentSeries({ series: null, loading: false, error: 'Trend unavailable for this metric' })
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        const fallback = buildRentFallbackSeries(location.avgRent)
        if (fallback.length > 0) {
          setRentSeries({ series: fallback, loading: false, error: '' })
          return
        }
        setRentSeries({ series: null, loading: false, error: 'Trend unavailable for this metric' })
      })
    return () => ac.abort()
  }, [location.borough, location.avgRent])

  const cost   = BOROUGH_COSTS[location.borough] ?? DEFAULT_COST
  const safety = getSafetyCtx(location.crimeRate ?? 65)

  const heroStyle = location.imageUrl
    ? {
        backgroundImage: [
          'linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.62) 100%)',
          `url('${location.imageUrl}')`,
        ].join(', '),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: 'linear-gradient(135deg, #1A3528 0%, #2A5E42 60%, #1A3528 100%)' }

  return (
    <div className={styles.container}>

      {/* ── Hero ── */}
      <motion.div className={styles.hero} style={heroStyle}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroBadge}><MapPin size={11} />{location.borough}</div>
        <h2 className={styles.heroName}>{location.name}</h2>
        <div className={styles.heroMeta}>
          <div className={styles.heroMetaChip}><Train size={11} /><span>{location.commuteTime} min commute</span></div>
          <div className={styles.heroMetaDot} />
          <div className={styles.heroMetaChip}><PoundSterling size={11} /><span>£{location.avgRent}/mo avg</span></div>
        </div>
      </motion.div>

      {/* ── Description ── */}
      {location.description && (
        <motion.p className={styles.description} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
          {location.description}
        </motion.p>
      )}

      {/* ── Highlights ── */}
      {location.highlights?.length > 0 && (
        <motion.div animate={{ opacity: 1 }} transition={{ delay: 0.16 }}>
          <div className={styles.sectionMicroLabel}><Sparkles size={10} />Highlights</div>
          <div className={styles.highlights}>
            {location.highlights.map(h => <span key={h} className={styles.highlight}>{h}</span>)}
          </div>
        </motion.div>
      )}

      {/* ── 7.1 Journey Simulator ── */}
      <motion.div className={styles.panel} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}>
        <div className={styles.sectionMicroLabel}><Navigation size={10} />Journey Simulator</div>

        <div className={styles.simControls}>
          <div className={styles.dirToggle}>
            <button
              className={`${styles.dirBtn} ${direction === 'toWork' ? styles.dirBtnActive : ''}`}
              onClick={() => setDirection('toWork')}
            >🏠 To Work</button>
            <button
              className={`${styles.dirBtn} ${direction === 'toHome' ? styles.dirBtnActive : ''}`}
              onClick={() => setDirection('toHome')}
            >🏢 To Home</button>
          </div>
          <label className={styles.timePickerRow}>
            <Clock size={12} color="var(--text-muted)" />
            <select className={styles.timePicker} value={departTime} onChange={e => setDepartTime(e.target.value)}>
              {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>

        <JourneyMap
          polyline={journey?.polyline ?? []}
          fromLat={location.lat || null}
          fromLng={location.lng || null}
          toLat={workCoords?.lat ?? null}
          toLng={workCoords?.lng ?? null}
        />

        <div className={styles.journeySteps}>
          {journeyLoading && (
            <motion.div className={styles.journeyPlaceholder}
              animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }}>
              Fetching live route from TfL…
            </motion.div>
          )}
          {!journeyLoading && journey?.legs?.length > 0 && (
            <>
              {journey.legs.map((leg, i) => {
                const c = MODE_COLOR[leg.mode] ?? '#6B7280'
                const l = MODE_LABEL[leg.mode] ?? leg.mode
                return (
                  <div key={i} className={styles.journeyStep}>
                    <span className={styles.stepMode} style={{ color: c, background: `${c}14`, borderColor: `${c}30` }}>{l}</span>
                    <span className={styles.stepSummary}>{leg.summary}</span>
                    <span className={styles.stepDur}>{leg.duration} min</span>
                  </div>
                )
              })}
              <div className={styles.journeyTotal}>
                <Clock size={13} color="#1D4ED8" />
                Total: <strong>{journey.duration} min</strong>
              </div>
            </>
          )}
          {!journeyLoading && !journey?.legs?.length && (
            <div className={styles.journeyPlaceholder}>
              Detailed route unavailable — estimated commute: {location.commuteTime} min
            </div>
          )}
        </div>
      </motion.div>

      <motion.div className={styles.panel} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}>
        <div className={styles.sectionMicroLabel}><MapPin size={14} />Where people live nearby</div>
        <ResidentialHotspotCard
          centerLat={location.lat}
          centerLng={location.lng}
          points={residentialPoints}
          densityFeatures={densityFeatures}
          loading={residentialLoading}
          error={residentialError}
        />
        <p className={styles.sourceNote}>OpenStreetMap residential buildings within 400 m</p>
      </motion.div>

      <motion.div className={styles.panel} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.30 }}>
        <div className={styles.sectionMicroLabel}><Sparkles size={10} />Trend - last 5 years</div>
        <TrendChart crime={crimeSeries} rent={rentSeries} />
        <p className={styles.sourceNote}>
          Crime: data.police.uk (annualised, severity-weighted) · Rent: ONS PRMS borough medians ({location.borough}) — historical years from archived releases, latest year live
        </p>
      </motion.div>

      {/* ── 7.2 Safety Context ── */}
      <motion.div className={styles.panel} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33 }}>
        <div className={styles.sectionMicroLabel}><Shield size={10} />Safety Context</div>
        <div className={styles.safetyInner}>
          <div className={styles.safetyRate}>
            <div className={styles.safetyRateNum} style={{ color: safety.color }}>
              {location.crimeRate != null ? location.crimeRate.toFixed(1) : '—'}
            </div>
            <div className={styles.safetyRateSub}>incidents per<br />1,000 residents / yr</div>
          </div>
          <div className={styles.safetySummary}>
            <div className={styles.safetyVerdict} style={{ color: safety.color }}>
              {safety.icon} {safety.label}
            </div>
            <div className={styles.safetyNote}>London average is ~65 per 1,000</div>
            <div className={styles.safetyBarWrap}>
              <motion.div
                className={styles.safetyBarFill}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ((location.crimeRate ?? 65) / 150) * 100)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: 0.45 }}
                style={{ background: safety.color }}
              />
            </div>
            <div className={styles.safetyScale}><span>Safest</span><span>Avg</span><span>Highest</span></div>
          </div>
        </div>
      </motion.div>

      {/* ── 7.3 Cost of Living ── */}
      <motion.div className={styles.panel} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
        <div className={styles.sectionMicroLabel}><PoundSterling size={10} />Cost of Living</div>
        <div className={styles.costTable}>
          <div className={styles.costRow}>
            <Building size={14} color="#1D4ED8" className={styles.costIco} />
            <span className={styles.costKey}>Council Tax</span>
            <span className={styles.costVal}>{cost.band}</span>
          </div>
          <div className={styles.costDivider} />
          <div className={styles.costRow}>
            <span className={styles.costIco} style={{ fontSize: '14px' }}>🍺</span>
            <span className={styles.costKey}>Average Pint</span>
            <span className={styles.costVal}>{cost.pint} · local pricing tier</span>
          </div>
          <div className={styles.costDivider} />
          <div className={styles.costRow}>
            <ShoppingCart size={14} color="#006B3C" className={styles.costIco} />
            <span className={styles.costKey}>Everyday Shops</span>
            <span className={styles.costVal}>{cost.shops}</span>
          </div>
        </div>
      </motion.div>

      {/* ── Platform buttons ── */}
      <motion.div animate={{ opacity: 1 }} transition={{ delay: 0.42 }}>
        <div className={styles.sectionMicroLabel}><Home size={10} />Search for properties</div>
        <div className={styles.platformGrid}>
          {PLATFORMS.map(p => (
            <a key={p.id} href={p.url(location.name)} target="_blank" rel="noopener noreferrer"
              className={styles.platformBtn} style={{ '--platform-color': p.color }}>
              <span>{p.label}</span><ExternalLink size={12} />
            </a>
          ))}
        </div>
      </motion.div>

      <motion.p className={styles.disclaimer} animate={{ opacity: 1 }} transition={{ delay: 0.52 }}>
        Cost of living figures are borough-level estimates for guidance only. Crime trends are sourced from the Met Police API where available. Rent trends use ONS PRMS borough medians: historical years are parsed from archived PRMS workbooks, and the latest year is fetched live. Residential hotspot layer uses OpenStreetMap.
      </motion.p>

      <motion.div className={styles.navRow} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}>
        <button className={styles.backBtn} onClick={onBack}><ArrowLeft size={16} /><span>Back to results</span></button>
        {onOpenDashboard && (
          <button className={styles.dashboardBtn} onClick={() => setDashboardChoiceOpen(true)}>
            <span>📋 Pin & Open Group Dashboard</span>
          </button>
        )}
      </motion.div>

      {dashboardChoiceOpen && (
        <div className={styles.choiceOverlay}>
          <div className={styles.choiceModal}>
            <h3 className={styles.choiceTitle}>Before opening dashboard</h3>
            <p className={styles.choiceText}>
              What would you like to do first?
            </p>
            <div className={styles.choiceActions}>
              <button
                className={styles.choiceBtnPrimary}
                onClick={() => {
                  setDashboardChoiceOpen(false)
                  onOpenDashboard?.('opinions')
                }}
              >
                Leave Web Feedback
              </button>
              <button
                className={styles.choiceBtnSecondary}
                onClick={() => {
                  setDashboardChoiceOpen(false)
                  onOpenDashboard?.('locations')
                }}
              >
                Find Roommates
              </button>
            </div>
            <button className={styles.choiceCancel} onClick={() => setDashboardChoiceOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ZONE_CONFIG = {
  transit: {
    radii: [2800, 7500, 14000],
    color: '#00C6FF',
    zoom: 11,
    label: '🚇 Transit zones',
  },
  car: {
    radii: [6500, 22000, 46000],
    color: '#F5A623',
    zoom: 10,
    label: '🚗 Driving zones',
  },
}

const ZONE_LABELS = ['~15 min', '~45 min', '~90 min']

export default function CommuteMap({ postcode, commuteMode }) {
  const mapDivRef  = useRef(null)
  const mapRef     = useRef(null)
  const circlesRef = useRef([])
  const markerRef  = useRef(null)
  const [status, setStatus] = useState('loading')
  const [center, setCenter] = useState(null)
  const fetchedRef = useRef(false)

  // Geocode postcode and init map once
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    const clean = postcode.replace(/\s+/g, '').toUpperCase()

    fetch(`https://api.postcodes.io/postcodes/${clean}`)
      .then(r => r.json())
      .then(data => {
        if (data.status !== 200) throw new Error('not found')
        const { latitude: lat, longitude: lng } = data.result
        setCenter({ lat, lng })
      })
      .catch(() => setStatus('error'))
  }, [postcode])

  // Init Leaflet map once center is known
  useEffect(() => {
    if (!center || !mapDivRef.current || mapRef.current) return

    const cfg = ZONE_CONFIG[commuteMode]
    const map = L.map(mapDivRef.current, {
      center: [center.lat, center.lng],
      zoom: cfg.zoom,
      zoomControl: true,
      attributionControl: false,
    })

    // Dark tile layer from CartoDB
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map)

    // Commute zone circles
    circlesRef.current = cfg.radii.map((radius, i) =>
      L.circle([center.lat, center.lng], {
        radius,
        color: cfg.color,
        fillColor: cfg.color,
        fillOpacity: i === 0 ? 0.10 : 0.04,
        weight: i === 0 ? 2 : 1,
        opacity: 0.7 - i * 0.15,
      }).addTo(map)
    )

    // Workplace pin
    const pin = L.divIcon({
      className: '',
      html: `<div style="
        width:16px;height:16px;border-radius:50%;
        background:#FF3B5C;border:3px solid #fff;
        box-shadow:0 0 0 3px rgba(255,59,92,0.4),0 2px 8px rgba(0,0,0,0.5);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
    markerRef.current = L.marker([center.lat, center.lng], { icon: pin }).addTo(map)

    mapRef.current = map
    setStatus('ready')
  }, [center]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update circles + zoom when mode changes
  useEffect(() => {
    if (!mapRef.current || !circlesRef.current.length || !center) return
    const cfg = ZONE_CONFIG[commuteMode]
    circlesRef.current.forEach((circle, i) => {
      circle.setStyle({ color: cfg.color, fillColor: cfg.color })
      circle.setRadius(cfg.radii[i])
    })
    mapRef.current.setZoom(cfg.zoom)
  }, [commuteMode, center])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  if (status === 'error') {
    return (
      <div style={{
        height: 260, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontSize: '1.5rem' }}>📍</div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
          Could not locate <strong style={{ color: '#fff' }}>{postcode}</strong>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>Check the postcode and try again</div>
      </div>
    )
  }

  const cfg = ZONE_CONFIG[commuteMode]

  return (
    <div style={{ position: 'relative', height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
      <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

      {/* Loading overlay */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(6,6,18,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(8px)', zIndex: 1000,
        }}>
          <span>📍</span> Locating {postcode}…
        </div>
      )}

      {/* Zone legend */}
      {status === 'ready' && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
          display: 'flex', flexDirection: 'column', gap: 3,
          pointerEvents: 'none',
        }}>
          {ZONE_LABELS.map((label, i) => (
            <div key={label} style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(6,6,18,0.82)',
              border: `1px solid ${cfg.color}50`,
              fontSize: '0.62rem', fontWeight: 700,
              color: cfg.color, opacity: 1 - i * 0.2,
            }}>
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Mode badge */}
      {status === 'ready' && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 1000,
          background: 'rgba(6,6,18,0.82)', borderRadius: 6,
          padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700,
          color: cfg.color, border: `1px solid ${cfg.color}40`,
          pointerEvents: 'none',
        }}>
          {cfg.label}
        </div>
      )}
    </div>
  )
}

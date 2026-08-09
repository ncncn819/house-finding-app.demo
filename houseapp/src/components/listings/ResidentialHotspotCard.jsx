import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import styles from './ResidentialHotspotCard.module.css'

export default function ResidentialHotspotCard({
  centerLat,
  centerLng,
  points,
  densityFeatures,
  loading,
  error,
}) {
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const heatRef = useRef(null)
  const heatZoomHandlerRef = useRef(null)

  useEffect(() => {
    if (loading) return
    const div = divRef.current
    if (!div || mapRef.current) return

    if (div._leaflet_id != null) {
      try { delete div._leaflet_id } catch { /* noop */ }
    }

    let map
    try {
      map = L.map(div, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      })

      // Base map without labels
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { 
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map)

      // Create a dedicated pane for labels so they render on top of the heatmap
      map.createPane('labelsPane')
      map.getPane('labelsPane').style.zIndex = 450
      map.getPane('labelsPane').style.pointerEvents = 'none'

      // Labels layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        pane: 'labelsPane'
      }).addTo(map)

      L.control.attribution({ position: 'bottomright', prefix: '© OpenStreetMap, © CartoDB' }).addTo(map)
      map.setView([centerLat, centerLng], 15)
      mapRef.current = map
      setTimeout(() => { try { map.invalidateSize() } catch { /* noop */ } }, 250)
    } catch (mountErr) {
      console.error('[ResidentialHotspotCard] init failed', mountErr)
      return
    }

    return () => {
      mapRef.current = null
      try { map.remove() } catch { /* noop */ }
    }
  }, [centerLat, centerLng, loading])

  useEffect(() => {
    const map = mapRef.current
    if (!map || centerLat == null || centerLng == null) return

    try {
      if (heatZoomHandlerRef.current) {
        map.off('zoomend', heatZoomHandlerRef.current)
        heatZoomHandlerRef.current = null
      }

      map.eachLayer(layer => {
        if (layer._custom) map.removeLayer(layer)
      })
      heatRef.current = null

      // Keep current zoom when the heat layer refreshes so zoom controls feel persistent.
      map.panTo([centerLat, centerLng])

      let geoLayer = null
      if (densityFeatures?.features?.length) {
        const ds = densityFeatures.features.map(f => f.properties?.density_per_km2 ?? 0)
        const lo = Math.min(...ds)
        const hi = Math.max(...ds)
        const ramp = (density) => {
          const t = hi === lo ? 0.5 : (density - lo) / (hi - lo)
          return `rgba(20, 100, 110, ${0.15 + t * 0.35})`
        }
        geoLayer = L.geoJSON(densityFeatures, {
          style: feature => ({
            fillColor: ramp(feature.properties?.density_per_km2 ?? 0),
            color: 'rgba(20,100,110,0.4)',
            weight: 0.5,
            fillOpacity: 1,
          }),
          onEachFeature: (feature, layer) => {
            const density = Math.round(feature.properties?.density_per_km2 ?? 0).toLocaleString()
            layer.bindTooltip(`OA ${feature.properties?.oa_code ?? 'n/a'} - ${density} residents/km^2`, { sticky: true })
          },
        })
        geoLayer._custom = true
        geoLayer.addTo(map)
      }

      if (Array.isArray(points) && points.length > 0) {
        const heat = L.heatLayer(points, {
          gradient: {
            0.2: 'rgba(68, 1, 84, 0)',
            0.4: '#3b528b',
            0.6: '#21918c',
            0.8: '#5ec962',
            1.0: '#fde725',
          },
          minOpacity: 0.35,
          radius: 28,
          blur: 22,
          maxZoom: 17,
          max: 10,
        })
        heat._custom = true
        heat.addTo(map)
        heatRef.current = heat

        // Calculate dense areas to place stylish tags
        const pointScores = points.map(p => {
          let count = 0;
          for (const other of points) {
            const dLat = p[0] - other[0];
            const dLng = p[1] - other[1];
            if (dLat * dLat + dLng * dLng < 0.000008) count++; // roughly ~30-40m radius
          }
          return { point: p, count };
        });
        pointScores.sort((a, b) => b.count - a.count);

        const tags = [];
        for (const p of pointScores) {
          if (tags.length >= 2) break;
          const tooClose = tags.some(t => {
            const dLat = p.point[0] - t.point[0];
            const dLng = p.point[1] - t.point[1];
            return dLat * dLat + dLng * dLng < 0.00008; // ensure tags aren't overlapping too much
          });
          if (!tooClose && p.count > 5) {
            tags.push(p);
          }
        }

        tags.forEach((tag, idx) => {
          const isPrimary = idx === 0;
          const icon = L.divIcon({
            className: styles.densityTagWrapper,
            html: `<div class="${styles.densityTag} ${isPrimary ? styles.densityTagPrimary : styles.densityTagSecondary}">
                     <span class="${styles.tagIcon}">${isPrimary ? '🔥' : '✨'}</span>
                     <span class="${styles.tagText}">${isPrimary ? 'Highest Density' : 'Popular Area'}</span>
                   </div>`,
            iconSize: [130, 34],
            iconAnchor: [65, 17]
          });
          const marker = L.marker(tag.point, { icon });
          marker._custom = true;
          marker.addTo(map);
        });
      }

      // Add 400m catchment radius dashed circle
      const radiusCircle = L.circle([centerLat, centerLng], {
        radius: 400,
        color: 'rgba(253, 219, 122, 0.4)',
        weight: 1.5,
        dashArray: '5 7',
        fill: true,
        fillColor: '#fddb7a',
        fillOpacity: 0.03
      });
      radiusCircle._custom = true;
      radiusCircle.addTo(map);

      // Center Orientation Marker
      const centerMarker = L.circleMarker([centerLat, centerLng], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#f76c5e',
        fillOpacity: 1,
        className: styles.centerPulse,
      });
      centerMarker._custom = true;
      centerMarker.addTo(map);
    } catch (updateErr) {
      console.error('[ResidentialHotspotCard] update failed', updateErr)
    }
  }, [centerLat, centerLng, points, densityFeatures])

  useEffect(() => {
    return () => {
      const map = mapRef.current
      if (map && heatZoomHandlerRef.current) {
        map.off('zoomend', heatZoomHandlerRef.current)
      }
      heatZoomHandlerRef.current = null
      heatRef.current = null
    }
  }, [])

  return (
    <section className={styles.wrapper}>
      {loading && <p className={styles.mutedText}>Loading residential hotspot...</p>}
      {!loading && error && <p className={styles.errorText}>{error}</p>}
      {!loading && !error && (!Array.isArray(points) || points.length === 0) && (
        <p className={styles.mutedText}>No residential density points found for this area.</p>
      )}

      {loading ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : (
        <div className={styles.mapFrame}>
          <div ref={divRef} className={styles.map} aria-label="Residential hotspot map" />
          <div className={styles.legend} aria-hidden="true">
            <span className={styles.legendLabel}>Fewer</span>
            <span className={styles.legendBar} />
            <span className={styles.legendLabel}>More residents</span>
          </div>
        </div>
      )}
    </section>
  )
}

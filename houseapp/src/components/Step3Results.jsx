import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, RotateCcw, ChevronDown, MapPin,
  Shield, Train, PoundSterling, Music, Trophy, Car, Clock,
  ExternalLink, AlertTriangle, Search, X,
} from 'lucide-react'
import styles from './Step3Results.module.css'

const API = 'http://localhost:8000/api/v1'

const METRIC_CFG = {
  safety:        { icon: Shield,        color: '#006B3C', label: 'Safety' },
  convenience:   { icon: Train,         color: '#1D4ED8', label: 'Commute' },
  cost:          { icon: PoundSterling, color: '#B8960C', label: 'Affordability' },
  entertainment: { icon: Music,         color: '#CF142B', label: 'Nightlife' },
}

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32', '#4E9068', '#4E9068']
const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th']

function ScoreBar({ value, color }) {
  return (
    <div className={styles.scoreBar}>
      <motion.div
        className={styles.scoreBarFill}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.75, ease: 'easeOut' }}
        style={{ background: color }}
      />
    </div>
  )
}

// ─── Result Card ───────────────────────────────────────────────────────────────
function ResultCard({ area, rank, index, onViewListings }) {
  const [expanded, setExpanded] = useState(rank === 1)
  const rankColor = rank <= 5 ? RANK_COLORS[rank - 1] : 'rgba(255,255,255,0.2)'
  const ModeIcon = area.adjData?.commuteMode === 'car' ? Car : Train

  const heroStyle = {
    backgroundImage: [
      `linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.65) 100%)`,
      area.imageUrl
        ? `url('${area.imageUrl}')`
        : `linear-gradient(135deg, #1A3528cc, #2A5E42cc)`,
    ].join(', '),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      layout
    >
      <button className={styles.cardHero} onClick={() => setExpanded(e => !e)} style={heroStyle}>
        <div className={styles.heroNoise} />

        <div className={styles.heroTopRow}>
          <div className={styles.rankBadge} style={{ color: rankColor, borderColor: `${rankColor}60`, background: `${rankColor}18` }}>
            {rank === 1 && <Trophy size={11} style={{ marginRight: 3 }} />}
            {RANK_LABELS[rank - 1] ?? `#${rank}`}
          </div>
          <div className={styles.heroScore} style={{ color: rankColor }}>
            {area.displayScore}
            <span className={styles.heroScoreLabel}>pts</span>
          </div>
        </div>

        <div className={styles.heroNameRow}>
          <div>
            <div className={styles.heroName}>{area.name}</div>
            <div className={styles.heroRegion}>
              <MapPin size={10} style={{ display: 'inline', marginRight: 3 }} />
              {area.borough}
            </div>
          </div>
          <motion.div
            className={styles.expandChevron}
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.22 }}
          >
            <ChevronDown size={14} color="rgba(255,255,255,0.6)" />
          </motion.div>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <Train size={11} />
            <span>{area.commuteTime} min{area.isRealTime ? '' : '*'}</span>
          </div>
          <div className={styles.heroStatDot} />
          <div className={styles.heroStat}>
            <PoundSterling size={11} />
            <span>£{area.avgRent}/mo</span>
          </div>
          {area.crimePenalty && (
            <>
              <div className={styles.heroStatDot} />
              <div className={styles.heroStat} style={{ color: '#FF6B6B' }}>
                <AlertTriangle size={11} />
                <span>Crime flag</span>
              </div>
            </>
          )}
        </div>
      </button>

      {/* Mini score bars */}
      <div className={styles.miniScores}>
        {Object.entries(METRIC_CFG).map(([key, cfg]) => (
          <div key={key} className={styles.miniScore}>
            <cfg.icon size={11} color={cfg.color} />
            <ScoreBar value={area.metricBars[key]} color={cfg.color} />
            <span className={styles.miniScoreVal}>{area.metricBars[key]}</span>
          </div>
        ))}
      </div>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className={styles.expandedContent}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.expandedInner}>
              <p className={styles.description}>{area.description}</p>

              <div className={styles.statsRow}>
                <div className={styles.stat}>
                  <Clock size={14} color="#1D4ED8" />
                  <div>
                    <div className={styles.statValue}>~{area.commuteTime} min{area.isRealTime ? '' : '*'}</div>
                    <div className={styles.statLabel}>{area.isRealTime ? 'Live TfL' : 'Est.'} commute</div>
                  </div>
                </div>
                <div className={styles.stat}>
                  <PoundSterling size={14} color="#B8960C" />
                  <div>
                    <div className={styles.statValue}>£{area.avgRent}/mo</div>
                    <div className={styles.statLabel}>Avg 1-bed rent</div>
                  </div>
                </div>
              </div>

              <div className={styles.highlights}>
                {area.highlights.map(h => (
                  <span key={h} className={styles.highlight}>{h}</span>
                ))}
              </div>

              <div className={styles.detailedScores}>
                {Object.entries(METRIC_CFG).map(([key, cfg]) => (
                  <div key={key} className={styles.detailedScore}>
                    <div className={styles.detailedScoreHeader}>
                      <cfg.icon size={12} color={cfg.color} />
                      <span style={{ color: cfg.color }}>{cfg.label}</span>
                      <span className={styles.detailedScoreNum}>{area.metricBars[key]}/100</span>
                    </div>
                    <ScoreBar value={area.metricBars[key]} color={cfg.color} />
                  </div>
                ))}
              </div>

              {area.crimePenalty && (
                <div className={styles.crimePenaltyNote}>
                  <AlertTriangle size={12} />
                  <span>Crime rate in top 10% — safety risk is strongly weighted</span>
                </div>
              )}

              <button
                className={styles.viewPropsBtn}
                onClick={(e) => { e.stopPropagation(); onViewListings(area) }}
              >
                <span>View Properties in {area.name}</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Search Bar ────────────────────────────────────────────────────────────────
function AreaSearchBar({ onViewListings }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API}/locations/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data)
      } catch { setResults([]) }
      setLoading(false)
    }, 280)
  }, [query])

  return (
    <div className={styles.searchBar}>
      <div className={styles.searchInputRow}>
        <Search size={14} color="var(--text-muted)" />
        <input
          className={styles.searchInput}
          placeholder="Search for a specific neighbourhood…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button className={styles.searchClear} onClick={() => { setQuery(''); setResults([]) }}>
            <X size={13} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            className={styles.searchDropdown}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {results.map(r => (
              <button
                key={r.id}
                className={styles.searchResult}
                onClick={() => { onViewListings(r); setQuery(''); setResults([]) }}
              >
                <div
                  className={styles.searchResultThumb}
                  style={{ backgroundImage: r.imageUrl ? `url('${r.imageUrl}')` : 'linear-gradient(135deg,#1A3528,#2A5E42)', backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
                <div>
                  <div className={styles.searchResultName}>{r.name}</div>
                  <div className={styles.searchResultMeta}>{r.borough} · £{r.avgRent}/mo · {r.commuteTime} min</div>
                </div>
                <MapPin size={11} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </motion.div>
        )}
        {loading && query.length >= 2 && results.length === 0 && (
          <motion.div className={styles.searchDropdown} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ padding: '12px 16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Searching…</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Step3Results({ priorities, postcode, commuteMode, commuteTimes, onBack, onReset, onViewListings }) {
  const [ranked, setRanked] = useState([])
  const [isRealTime, setIsRealTime] = useState(false)
  const [isLiveCrime, setIsLiveCrime] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const ModeIcon = commuteMode === 'transit' ? Train : Car

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workPostcode: postcode,
            commuteMode,
            weights: {
              safety:        priorities.safety        * 10,
              convenience:   priorities.convenience   * 10,
              cost:          priorities.cost          * 10,
              entertainment: priorities.entertainment * 10,
            },
          }),
        })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const data = await res.json()
        setRanked(data.results.map(r => ({ ...r, adjData: { commuteMode } })))
        setIsRealTime(data.isRealTime)
        setIsLiveCrime(data.isLiveCrime ?? false)
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    run()
  }, [postcode, commuteMode, priorities])

  if (loading) {
    return (
      <div className={styles.container} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }}
          style={{ fontFamily: 'var(--font-heading)', fontSize: '0.72rem', letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Ranking neighbourhoods…
        </motion.div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: '#c0392b', fontSize: '0.86rem' }}>Could not load results — is the backend running?</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: 8 }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <motion.div className={styles.header} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className={styles.badge}>
          <Trophy size={13} />
          Top results for {postcode}
        </div>
        <h2 className={styles.title}>
          Your perfect<br />
          <span className={styles.titleGradient}>London neighbourhoods</span>
        </h2>
        <p className={styles.subtitle}>
          Ranked using Z-score normalisation, weighted by your priorities. Tap any card to explore.
        </p>
        <div className={styles.commuteSummary}>
          <ModeIcon size={12} />
          <span>{commuteMode === 'transit' ? 'Public transport' : 'Car'}</span>
          <span className={styles.dot}>·</span>
          <span>from {postcode}</span>
          {isRealTime && (
            <>
              <span className={styles.dot}>·</span>
              <span style={{ color: '#22c55e', fontSize: '11px' }}>🚇 Live TfL times</span>
            </>
          )}
          {isLiveCrime && (
            <>
              <span className={styles.dot}>·</span>
              <span style={{ color: '#f97316', fontSize: '11px' }}>🚔 Live crime data</span>
            </>
          )}
        </div>
      </motion.div>

      {/* Search bar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <AreaSearchBar onViewListings={onViewListings} />
      </motion.div>

      <div className={styles.sectionLabel}>
        <Trophy size={12} color="#FFD700" /> Top 5 neighbourhoods
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.resultsList}>
        {ranked.map((area, i) => (
          <ResultCard key={area.id} area={area} rank={i + 1} index={i} onViewListings={onViewListings} />
        ))}
      </div>

      <motion.p className={styles.disclaimer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
        {[
          isRealTime ? '🚇 Journey times sourced live from TfL.' : '* Journey times are estimates (TfL unavailable).',
          isLiveCrime ? '🚔 Crime data sourced live from Met Police API.' : '',
          'Scores use Z-score normalisation + exponential commute/crime penalties. Rental prices are illustrative.',
        ].filter(Boolean).join(' ')}
      </motion.p>

      <motion.div className={styles.navRow} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
        <button className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={16} /><span>Adjust priorities</span>
        </button>
        <button className={styles.resetBtn} onClick={onReset}>
          <RotateCcw size={16} /><span>Start over</span>
        </button>
      </motion.div>
    </div>
  )
}

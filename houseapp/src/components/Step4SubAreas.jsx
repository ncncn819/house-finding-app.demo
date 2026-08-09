import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ChevronDown, MapPin, Shield, Train, PoundSterling, Music,
  Trophy, Car, Clock, ExternalLink, Home, Sparkles, AlertTriangle,
} from 'lucide-react'
import { SUB_AREAS } from '../data/subAreas'
import { rankSubAreas } from '../data/scoring'
import styles from './Step4SubAreas.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32', '#4E9068', '#4E9068']
const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th']

const METRIC_CFG = {
  safety:        { icon: Shield,        color: '#006B3C', label: 'Safety' },
  convenience:   { icon: Train,         color: '#1D4ED8', label: 'Commute' },
  cost:          { icon: PoundSterling, color: '#B8960C', label: 'Affordability' },
  entertainment: { icon: Music,         color: '#CF142B', label: 'Nightlife' },
}

const PLATFORMS = [
  {
    id: 'zoopla',
    label: 'Zoopla',
    color: '#7C3AED',
    url: (postcode) =>
      `https://www.zoopla.co.uk/to-rent/property/london/?q=${encodeURIComponent(postcode)}&search_source=to-rent`,
  },
  {
    id: 'rightmove',
    label: 'Rightmove',
    color: '#00639B',
    url: (postcode) =>
      `https://www.rightmove.co.uk/property-to-rent/find.html?searchType=RENT&locationIdentifier=POSTCODE%5E${postcode.replace(' ', '')}`,
  },
  {
    id: 'openrent',
    label: 'OpenRent',
    color: '#E05C00',
    url: (postcode) =>
      `https://www.openrent.co.uk/properties-to-rent/-london?term=${encodeURIComponent(postcode)}`,
  },
  {
    id: 'spareroom',
    label: 'SpareRoom',
    color: '#0E7490',
    url: (_postcode, name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      return `https://www.spareroom.co.uk/flatshare/london/${slug}`
    },
  },
]

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

// ─── Sub-area Card ─────────────────────────────────────────────────────────────
function SubAreaCard({ ranked, rank, index, commuteMode }) {
  const { sub, displayScore, metricBars, commuteTime, crimePenalty } = ranked
  const [expanded, setExpanded] = useState(rank === 1)
  const rankColor = RANK_COLORS[rank - 1] ?? 'rgba(255,255,255,0.25)'
  const ModeIcon  = commuteMode === 'transit' ? Train : Car

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      layout
    >
      {/* Hero */}
      <button className={styles.cardHero} onClick={() => setExpanded(e => !e)}>
        <div className={styles.heroOverlay} />

        {/* Top row: rank + score */}
        <div className={styles.heroTopRow}>
          <div className={styles.rankBadge} style={{ color: rankColor, borderColor: `${rankColor}60`, background: `${rankColor}18` }}>
            {rank === 1 && <Trophy size={11} style={{ marginRight: 3 }} />}
            {RANK_LABELS[rank - 1] ?? `#${rank}`}
          </div>
          <div className={styles.heroScore} style={{ color: rankColor }}>
            {displayScore}
            <span className={styles.heroScoreLabel}>pts</span>
          </div>
        </div>

        {/* Name + character */}
        <div className={styles.heroNameRow}>
          <div>
            <div className={styles.heroName}>{sub.name}</div>
            <div className={styles.heroCharacter}>{sub.character}</div>
          </div>
          <motion.div
            className={styles.expandChevron}
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.22 }}
          >
            <ChevronDown size={14} color="rgba(255,255,255,0.55)" />
          </motion.div>
        </div>

        {/* Transport chips */}
        <div className={styles.transportChips}>
          {sub.transport.map(t => (
            <span key={t} className={styles.transportChip}>
              <Train size={9} style={{ marginRight: 3 }} />{t}
            </span>
          ))}
        </div>

        {/* Bottom stats */}
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <ModeIcon size={11} />
            <span>~{commuteTime} min</span>
          </div>
          <div className={styles.heroStatDot} />
          <div className={styles.heroStat}>
            <PoundSterling size={11} />
            <span>{sub.avgRent}</span>
          </div>
          <div className={styles.heroStatDot} />
          <div className={styles.heroStat}>
            <MapPin size={11} />
            <span>{sub.postcode}</span>
          </div>
          {crimePenalty && (
            <>
              <div className={styles.heroStatDot} />
              <div className={styles.heroStat} style={{ color: '#FF6B6B' }}>
                <AlertTriangle size={11} />
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
            <ScoreBar value={metricBars[key]} color={cfg.color} />
            <span className={styles.miniScoreVal}>{metricBars[key]}</span>
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
              <p className={styles.description}>{sub.description}</p>

              {/* Stat boxes */}
              <div className={styles.statsRow}>
                <div className={styles.stat}>
                  <Clock size={14} color="#1D4ED8" />
                  <div>
                    <div className={styles.statValue}>~{commuteTime} min</div>
                    <div className={styles.statLabel}>{commuteMode === 'transit' ? 'Transit' : 'Car'} commute</div>
                  </div>
                </div>
                <div className={styles.stat}>
                  <PoundSterling size={14} color="#B8960C" />
                  <div>
                    <div className={styles.statValue}>{sub.avgRent}</div>
                    <div className={styles.statLabel}>Avg 1-bed rent</div>
                  </div>
                </div>
                <div className={styles.stat}>
                  <MapPin size={14} color="#006B3C" />
                  <div>
                    <div className={styles.statValue}>{sub.postcode}</div>
                    <div className={styles.statLabel}>Area postcode</div>
                  </div>
                </div>
              </div>

              {/* Highlights */}
              <div>
                <div className={styles.sectionMicroLabel}>
                  <Sparkles size={10} />Highlights
                </div>
                <div className={styles.highlights}>
                  {sub.highlights.map(h => (
                    <span key={h} className={styles.highlight}>{h}</span>
                  ))}
                </div>
              </div>

              {/* Detailed score bars */}
              <div className={styles.detailedScores}>
                {Object.entries(METRIC_CFG).map(([key, cfg]) => (
                  <div key={key} className={styles.detailedScore}>
                    <div className={styles.detailedScoreHeader}>
                      <cfg.icon size={12} color={cfg.color} />
                      <span style={{ color: cfg.color }}>{cfg.label}</span>
                      <span className={styles.detailedScoreNum}>{metricBars[key]}/100</span>
                    </div>
                    <ScoreBar value={metricBars[key]} color={cfg.color} />
                  </div>
                ))}
              </div>

              {crimePenalty && (
                <div className={styles.crimePenaltyNote}>
                  <AlertTriangle size={12} />
                  <span>Crime rate in top 10% of this area — score penalised by 50%</span>
                </div>
              )}

              {/* Platform buttons */}
              <div>
                <div className={styles.sectionMicroLabel}>
                  <Home size={10} />Search on platform
                </div>
                <div className={styles.platformBtns}>
                  {PLATFORMS.map(p => (
                    <a
                      key={p.id}
                      href={p.url(sub.postcode, sub.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.platformBtn}
                      style={{ '--platform-color': p.color }}
                    >
                      <span>{p.label}</span>
                      <ExternalLink size={11} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Step4SubAreas({ area, priorities, commuteMode, commuteTimes, onBack }) {
  const subList = SUB_AREAS[area.id] ?? []

  // Resolve parent commute time (use real TfL time if available)
  const parentCommute = commuteTimes?.[area.id]?.[commuteMode] ?? area.commuteMin[commuteMode]

  // rankSubAreas runs the full Z-score + WLC + penalty pipeline within the cohort
  const ranked = rankSubAreas(subList, parentCommute, priorities)

  const ModeIcon = commuteMode === 'transit' ? Train : Car

  return (
    <div className={styles.container}>
      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbParent}>London Areas</span>
          <ChevronDown size={11} style={{ transform: 'rotate(-90deg)', opacity: 0.4 }} />
          <span className={styles.breadcrumbCurrent}>{area.name}</span>
        </div>

        <div className={styles.badge}>
          <MapPin size={12} />
          Neighbourhood breakdown
        </div>

        <h2 className={styles.title}>
          {area.image} Exploring<br />
          <span className={styles.titleAccent}>{area.name}</span>
        </h2>
        <p className={styles.subtitle}>
          Sub-neighbourhoods ranked by Z-score normalisation, weighted by your priorities. Expand any card to find properties.
        </p>

        <div className={styles.metaRow}>
          <div className={styles.metaChip}>
            <ModeIcon size={11} />
            <span>~{parentCommute} min {commuteMode === 'transit' ? 'by transit' : 'by car'}</span>
          </div>
          <div className={styles.metaDot} />
          <div className={styles.metaChip}>
            <PoundSterling size={11} />
            <span>{area.avgRent} avg (area)</span>
          </div>
          <div className={styles.metaDot} />
          <div className={styles.metaChip}>
            <MapPin size={11} />
            <span>{area.region}</span>
          </div>
        </div>
      </motion.div>

      {/* Section label */}
      <div className={styles.sectionLabel}>
        <Trophy size={12} color="#FFD700" />
        {ranked.length} neighbourhoods ranked
        <div className={styles.sectionLine} />
      </div>

      {/* Cards */}
      <div className={styles.cardsList}>
        {ranked.map((item, i) => (
          <SubAreaCard
            key={item.sub.name}
            ranked={item}
            rank={i + 1}
            index={i}
            commuteMode={commuteMode}
          />
        ))}
      </div>

      {/* Disclaimer */}
      <motion.p
        className={styles.disclaimer}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        Rankings use Z-score normalisation + exponential commute/crime penalties within this neighbourhood cohort. Rental prices are illustrative — verify before deciding.
      </motion.p>

      {/* Back nav */}
      <motion.div
        className={styles.navRow}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <button className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to areas</span>
        </button>
      </motion.div>
    </div>
  )
}

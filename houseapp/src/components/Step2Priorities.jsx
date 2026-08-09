import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Shield, Train, PoundSterling, Music, Lock, Unlock } from 'lucide-react'
import RadarChart from './RadarChart'
import styles from './Step2Priorities.module.css'

const BUDGET = 20
const KEYS = ['safety', 'convenience', 'cost', 'entertainment']

const PRIORITY_CONFIG = [
  {
    key: 'safety',
    label: 'Safety',
    icon: Shield,
    color: '#006B3C',
    trackColor: 'rgba(0,107,60,0.15)',
    emoji: '🛡️',
    labels: ['High activity', 'Balanced', 'Very safe'],
  },
  {
    key: 'convenience',
    label: 'Commute',
    icon: Train,
    color: '#1D4ED8',
    trackColor: 'rgba(29,78,216,0.12)',
    emoji: '🚇',
    labels: ['Remote', 'Manageable', 'Quick links'],
  },
  {
    key: 'cost',
    label: 'Affordability',
    icon: PoundSterling,
    color: '#B8960C',
    trackColor: 'rgba(184,150,12,0.12)',
    emoji: '💷',
    labels: ['Premium', 'Mid-range', 'Budget friendly'],
  },
  {
    key: 'entertainment',
    label: 'Nightlife',
    icon: Music,
    color: '#CF142B',
    trackColor: 'rgba(207,20,43,0.10)',
    emoji: '🎭',
    labels: ['Peaceful', 'Good scene', 'Vibrant'],
  },
]

function getLabel(cfg, val) {
  if (val <= 3) return cfg.labels[0]
  if (val <= 7) return cfg.labels[1]
  return cfg.labels[2]
}

function redistributePriorities(prev, lockedKeys, changedKey, rawVal) {
  const freeKeys = KEYS.filter(k => k !== changedKey && !lockedKeys.has(k))
  const lockedSum = KEYS
    .filter(k => k !== changedKey && lockedKeys.has(k))
    .reduce((s, k) => s + prev[k], 0)

  const maxForChanged = BUDGET - lockedSum - freeKeys.length
  const clampedVal = Math.min(10, Math.max(1, Math.min(maxForChanged, rawVal)))

  if (freeKeys.length === 0) return prev

  const remaining = BUDGET - clampedVal - lockedSum
  const currentFreeSum = freeKeys.reduce((s, k) => s + prev[k], 0)

  let scaled = currentFreeSum > 0
    ? freeKeys.map(k => (prev[k] / currentFreeSum) * remaining)
    : freeKeys.map(() => remaining / freeKeys.length)

  let rounded = scaled.map(v => Math.min(10, Math.max(1, Math.round(v))))

  let diff = remaining - rounded.reduce((a, b) => a + b, 0)
  for (let pass = 0; diff !== 0 && pass < 50; pass++) {
    for (let i = 0; i < rounded.length && diff !== 0; i++) {
      if (diff > 0 && rounded[i] < 10) { rounded[i]++; diff-- }
      else if (diff < 0 && rounded[i] > 1) { rounded[i]--; diff++ }
    }
  }

  const result = { ...prev, [changedKey]: clampedVal }
  freeKeys.forEach((k, i) => { result[k] = rounded[i] })
  return result
}

export default function Step2Priorities({ priorities, setPriorities, postcode, onBack, onNext }) {
  const [locked, setLocked] = useState(new Set())
  const [activeKey, setActiveKey] = useState(null)

  const toggleLock = (key) => {
    setLocked(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleChange = (key, rawValue) => {
    if (KEYS.filter(k => k !== key && !locked.has(k)).length === 0) return
    setPriorities(prev => redistributePriorities(prev, locked, key, Number(rawValue)))
  }

  const radarValues = {
    safety:        priorities.safety        * 10,
    convenience:   priorities.convenience   * 10,
    cost:          priorities.cost          * 10,
    entertainment: priorities.entertainment * 10,
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className={styles.postcodeTag}>
          <span className={styles.postcodeTagDot} />
          Workplace: <strong>{postcode}</strong>
        </div>
        <h2 className={styles.title}>What matters most?</h2>
        <p className={styles.subtitle}>
          Distribute <strong>{BUDGET} points</strong> across your priorities.
          Lock any row to protect its value while you adjust the others.
        </p>
      </motion.div>

      {/* Main layout */}
      <div className={styles.mainLayout}>

        {/* Left: slider rows */}
        <div className={styles.sliderStack}>
          {PRIORITY_CONFIG.map((cfg, idx) => {
            const val = priorities[cfg.key]
            const isLocked = locked.has(cfg.key)
            const isActive = activeKey === cfg.key
            const canMove = KEYS.filter(k => k !== cfg.key && !locked.has(k)).length > 0
            const Icon = cfg.icon
            const pct = ((val - 1) / 9) * 100

            return (
              <motion.div
                key={cfg.key}
                className={`${styles.row} ${isLocked ? styles.rowLocked : ''} ${isActive ? styles.rowActive : ''}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + idx * 0.07 }}
              >
                {/* Left meta */}
                <div className={styles.rowMeta}>
                  <div className={styles.rowIcon} style={{ background: `${cfg.color}18`, color: cfg.color }}>
                    <Icon size={13} />
                  </div>
                  <div className={styles.rowInfo}>
                    <span className={styles.rowLabel} style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className={styles.rowSemantic}>{getLabel(cfg, val)}</span>
                  </div>
                </div>

                {/* Slider track */}
                <div className={styles.trackArea}>
                  <div className={styles.trackBg} style={{ background: cfg.trackColor }}>
                    <motion.div
                      className={styles.trackFill}
                      style={{ background: cfg.color }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.12 }}
                    />
                  </div>
                  <input
                    type="range"
                    min={1} max={10} step={1}
                    value={val}
                    disabled={isLocked || !canMove}
                    onChange={e => handleChange(cfg.key, e.target.value)}
                    onFocus={() => setActiveKey(cfg.key)}
                    onBlur={() => setActiveKey(null)}
                    className={styles.slider}
                    style={{ '--c': cfg.color, cursor: isLocked || !canMove ? 'not-allowed' : 'grab' }}
                  />
                </div>

                {/* Right: value + lock */}
                <div className={styles.rowRight}>
                  <div className={styles.rowValue} style={{ color: isActive ? cfg.color : 'var(--forest)' }}>
                    {val}
                    <span className={styles.rowValueMax}>/10</span>
                  </div>
                  <button
                    className={`${styles.lockBtn} ${isLocked ? styles.lockBtnOn : ''}`}
                    style={{ '--c': cfg.color }}
                    onClick={() => toggleLock(cfg.key)}
                    title={isLocked ? 'Unlock' : 'Lock'}
                  >
                    {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                </div>
              </motion.div>
            )
          })}

          {/* Tick legend */}
          <div className={styles.tickRow}>
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>

        {/* Right: radar + score */}
        <motion.div
          className={styles.radarPanel}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
        >
          <div className={styles.radarTitle}>Priority Profile</div>
          <RadarChart values={radarValues} size={220} activeKey={activeKey} />
          <div className={styles.scoreBlock}>
            <div className={styles.scoreRow}>
              {PRIORITY_CONFIG.map(cfg => (
                <div key={cfg.key} className={styles.scoreChip}>
                  <cfg.icon size={10} color={cfg.color} />
                  <span style={{ color: cfg.color }}>{priorities[cfg.key]}</span>
                </div>
              ))}
            </div>
            <div className={styles.fullyAllocated}>✓ {BUDGET} pts fully allocated</div>
          </div>
          <p className={styles.radarHint}>Lock sliders to protect values</p>
        </motion.div>
      </div>

      {/* Navigation */}
      <motion.div
        className={styles.navRow}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        <button className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={16} /><span>Back</span>
        </button>
        <motion.button
          className={styles.nextBtn}
          onClick={onNext}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}
          whileTap={{ scale: 0.97 }}
        >
          <span>See My Results</span>
          <ArrowRight size={18} />
        </motion.button>
      </motion.div>
    </div>
  )
}

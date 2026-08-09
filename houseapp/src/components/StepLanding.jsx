import { motion } from 'framer-motion'
import { MapPin, Clock, BarChart3, ArrowRight, Shield, Train, PoundSterling, Music } from 'lucide-react'
import styles from './StepLanding.module.css'

const HOW_IT_WORKS = [
  {
    icon: MapPin,
    color: '#1A3528',
    colorBg: 'rgba(26,53,40,0.07)',
    step: '01',
    title: 'Enter your workplace',
    desc: 'Just your postcode — we calculate commute times from there across England.',
  },
  {
    icon: Clock,
    color: '#2A5E42',
    colorBg: 'rgba(42,94,66,0.07)',
    step: '02',
    title: 'Choose your commute mode',
    desc: 'Tube, rail, bus or car — we factor in journey time and travel costs.',
  },
  {
    icon: BarChart3,
    color: '#4E9068',
    colorBg: 'rgba(78,144,104,0.08)',
    step: '03',
    title: 'Weight your priorities',
    desc: 'Safety, convenience, cost, or nightlife — tell us what matters most.',
  },
]

const CATEGORIES = [
  { icon: Shield,       color: 'rgba(255,255,255,0.85)', label: 'Safety' },
  { icon: Train,        color: 'rgba(255,255,255,0.85)', label: 'Commute' },
  { icon: PoundSterling,color: 'rgba(255,255,255,0.85)', label: 'Cost' },
  { icon: Music,        color: 'rgba(255,255,255,0.85)', label: 'Nightlife' },
]

const TRUST_ITEMS = [
  { icon: Shield,   label: 'Commute-based matching' },
  { icon: MapPin,   label: 'England-wide coverage' },
  { icon: BarChart3,label: 'Transparent scoring' },
]

export default function StepLanding({ onStart, heroBgUrl }) {
  const heroStyle = heroBgUrl
    ? { backgroundImage: `url('${heroBgUrl}')` }
    : {}

  return (
    <div className={styles.container}>
      {/* ── Full-bleed London hero ── */}
      <div className={styles.heroSection} style={heroStyle}>
        <div className={styles.heroOverlay} />

        <motion.div
          className={styles.heroContent}
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Badge */}
          <motion.div
            className={styles.pillBadge}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <span className={styles.pillDot} />
            England housing discovery
          </motion.div>

          <h1 className={styles.heroTitle}>
            Find where to live<br />
            <span className={styles.heroAccent}>based on your commute.</span>
          </h1>

          <p className={styles.heroSubtitle}>
            Enter your workplace postcode, set your commute budget, weight your lifestyle priorities —
            we rank the best areas in the UK for you.
          </p>

          {/* Category chips */}
          <div className={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <div key={cat.label} className={styles.categoryChip}>
                <cat.icon size={13} color={cat.color} />
                <span>{cat.label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <motion.button
            className={styles.ctaBtn}
            onClick={onStart}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <span>Find my area</span>
            <ArrowRight size={18} />
          </motion.button>

          {/* Trust row */}
          <motion.div
            className={styles.trustRow}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {TRUST_ITEMS.map((t) => (
              <div key={t.label} className={styles.trustItem}>
                <t.icon size={13} color="rgba(255,255,255,0.55)" />
                <span>{t.label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          className={styles.scrollHint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          <div className={styles.scrollLine} />
          <span>How it works</span>
          <div className={styles.scrollLine} />
        </motion.div>
      </div>

      {/* ── How it works — clean white section ── */}
      <motion.div
        className={styles.howSection}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <p className={styles.howLabel}>How it works</p>
        <div className={styles.howSteps}>
          {HOW_IT_WORKS.map((item, i) => (
            <motion.div
              key={item.step}
              className={styles.howCard}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
            >
              <div className={styles.howIconWrap} style={{ background: item.colorBg }}>
                <item.icon size={18} color={item.color} />
              </div>
              <div className={styles.howStepNum} style={{ color: item.color }}>{item.step}</div>
              <div className={styles.howTitle}>{item.title}</div>
              <div className={styles.howDesc}>{item.desc}</div>
            </motion.div>
          ))}
        </div>

        <p className={styles.privacy}>
          🔒 We use your postcode only to estimate travel times. We don't store or sell your data.
        </p>
      </motion.div>
    </div>
  )
}

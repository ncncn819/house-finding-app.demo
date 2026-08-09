import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Train, Car } from 'lucide-react'
import CommuteMap from './CommuteMap'
import styles from './StepCommute.module.css'

export default function StepCommute({ postcode, commuteMode, setCommuteMode, onBack, onNext }) {
  return (
    <div className={styles.container}>
      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className={styles.postcodeTag}>
          <span className={styles.dot} />
          Workplace: <strong>{postcode}</strong>
        </div>
        <h2 className={styles.title}>
          How do you<br />
          <span className={styles.titleGradient}>get to work?</span>
        </h2>
        <p className={styles.subtitle}>
          Choose how you commute — this shapes how we score each neighbourhood.
        </p>
      </motion.div>

      {/* Mode selector */}
      <motion.div
        className={styles.modeGrid}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {[
          {
            value: 'transit', icon: Train, label: 'Public transport',
            desc: 'Tube, rail, bus, tram',
            detail: 'Best route by public transit — faster short-distance commutes score higher.',
          },
          {
            value: 'car', icon: Car, label: 'Car',
            desc: 'Drive to work',
            detail: 'Door-to-door drive time — areas with shorter drives and easier parking rank better.',
          },
        ].map((opt) => {
          const active = commuteMode === opt.value
          return (
            <motion.button
              key={opt.value}
              className={`${styles.modeCard} ${active ? styles.modeCardActive : ''}`}
              onClick={() => setCommuteMode(opt.value)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={`${styles.modeIcon} ${active ? styles.modeIconActive : ''}`}>
                <opt.icon size={26} />
              </div>
              <div className={styles.modeLabel}>{opt.label}</div>
              <div className={styles.modeDesc}>{opt.desc}</div>
              <div className={styles.modeDetail}>{opt.detail}</div>
              {active && (
                <motion.div
                  className={styles.modeCheck}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >✓</motion.div>
              )}
            </motion.button>
          )
        })}
      </motion.div>

      {/* Dynamic Google Map — commute zones from workplace postcode */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <CommuteMap postcode={postcode} commuteMode={commuteMode} />
        <p className={styles.isoLabel} style={{ marginTop: 8 }}>
          Circles show approximate commute time zones from your workplace
        </p>
      </motion.div>

      {/* Nav */}
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
          <span>Set priorities</span>
          <ArrowRight size={18} />
        </motion.button>
      </motion.div>
    </div>
  )
}


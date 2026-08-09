import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchAllCommuteTimes } from '../tfl'
import { fetchAreaPhotos } from '../photos'
import { UK_AREAS } from '../data/areas'
import styles from './StepLoading.module.css'

const STEPS = [
  { text: 'Validating workplace postcode…', icon: '📍' },
  { text: 'Fetching real commute times from TfL…', icon: '🚇' },
  { text: 'Loading neighbourhood photos…', icon: '🖼️' },
  { text: 'Applying your priority weights…', icon: '⚖️' },
  { text: 'Ranking your Top 10…', icon: '🏆' },
]

export default function StepLoading({ postcode, onDone, onCommuteTimes, onPhotoUrls }) {
  const [currentStep, setCurrentStep] = useState(0)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    // Kick off TfL + photo fetches immediately in background
    const tflPromise = fetchAllCommuteTimes(postcode, UK_AREAS)
      .then(times => onCommuteTimes(times))
      .catch(() => onCommuteTimes(null)) // silently fall back to hardcoded

    const photoPromise = fetchAreaPhotos(UK_AREAS)
      .then(urls => onPhotoUrls?.(urls))
      .catch(() => {}) // silently skip — gradient fallback used

    // Animate through steps, waiting for TfL on the last step
    let step = 0
    const advance = () => {
      step += 1
      if (step < STEPS.length - 1) {
        setCurrentStep(step)
        setTimeout(advance, 700)
      } else {
        // Wait for TfL (or timeout after 8s) before final step
        const timeout = setTimeout(() => {
          setCurrentStep(STEPS.length - 1)
          setTimeout(onDone, 800)
        }, 8000)

        Promise.all([tflPromise, photoPromise]).finally(() => {
          clearTimeout(timeout)
          setCurrentStep(STEPS.length - 1)
          setTimeout(onDone, 800)
        })
      }
    }
    setTimeout(advance, 700)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.container}>
      {/* Central animation */}
      <div className={styles.orbWrap}>
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className={styles.ring}
            animate={{ scale: [1, 1 + i * 0.25], opacity: [0.4, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }}
          />
        ))}
        <motion.div
          className={styles.orb}
          animate={{ boxShadow: ['0 0 30px rgba(207,20,43,0.5)', '0 0 60px rgba(207,20,43,0.8)', '0 0 30px rgba(207,20,43,0.5)'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.span
            key={currentStep}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ fontSize: '2rem' }}
          >
            {STEPS[currentStep].icon}
          </motion.span>
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={currentStep}
          className={styles.stepText}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {STEPS[currentStep].text}
        </motion.p>
      </AnimatePresence>

      <div className={styles.dots}>
        {STEPS.map((_, i) => (
          <motion.div
            key={i}
            className={styles.dot}
            animate={{
              background: i <= currentStep
                ? 'linear-gradient(135deg, #CF142B, #E8354A)'
                : 'rgba(255,255,255,0.1)',
              scale: i === currentStep ? 1.3 : 1,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      <div className={styles.progressTrack}>
        <motion.div
          className={styles.progressFill}
          animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <p className={styles.hint}>Calculating real journey times for 20 London areas…</p>
    </div>
  )
}

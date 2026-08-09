import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, ArrowRight, Building2, ArrowLeft } from 'lucide-react'
import styles from './Step1PostcodeEntry.module.css'

const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i

export default function Step1PostcodeEntry({ postcode, setPostcode, onBack, onNext }) {
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)

  const isValid = UK_POSTCODE_REGEX.test(postcode.trim())
  const showError = touched && postcode.length > 0 && !isValid

  const handleChange = (e) => {
    setPostcode(e.target.value.toUpperCase())
  }

  const handleBlur = () => {
    setFocused(false)
    setTouched(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isValid) onNext()
  }

  return (
    <div className={styles.container}>
      {/* Icon badge */}
      <motion.div
        className={styles.iconBadge}
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
      >
        <Building2 size={28} />
      </motion.div>

      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className={styles.title}>
          Find your perfect<br />
          <span className={styles.titleGradient}>London neighbourhood</span>
        </h1>
        <p className={styles.subtitle}>
          Enter your workplace postcode and we'll calculate the best areas to live based on your lifestyle priorities.
        </p>
      </motion.div>

      {/* Input card */}
      <motion.div
        className={`${styles.inputCard} ${focused ? styles.inputCardFocused : ''} ${showError ? styles.inputCardError : ''}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className={styles.inputWrapper}>
          <div className={styles.inputIcon}>
            <MapPin size={20} color={focused ? '#E8354A' : '#475569'} />
          </div>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. EC1A 1BB"
            value={postcode}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            maxLength={8}
            spellCheck={false}
            autoComplete="off"
          />
          {isValid && (
            <motion.div
              className={styles.validBadge}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              ✓
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {showError && (
            <motion.p
              className={styles.errorMsg}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              Please enter a valid UK postcode (e.g. SW1A 2AA)
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* CTA button */}
      <AnimatePresence>
        {isValid && (
          <motion.button
            className={styles.nextBtn}
            onClick={onNext}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}
            whileTap={{ scale: 0.97 }}
          >
            <span>Set My Priorities</span>
            <ArrowRight size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div
        className={styles.navRow}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        <button className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
      </motion.div>

      {/* Example postcodes */}
      <motion.div
        className={styles.examples}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <span className={styles.examplesLabel}>Try:</span>
        {['EC1A 1BB', 'W1A 1AA', 'SE1 7PB', 'N1 9GU'].map((pc) => (
          <button
            key={pc}
            className={styles.exampleChip}
            onClick={() => { setPostcode(pc); setTouched(true) }}
          >
            {pc}
          </button>
        ))}
      </motion.div>
    </div>
  )
}

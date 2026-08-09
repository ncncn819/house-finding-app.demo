import { useState, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { fetchBackgroundPhoto } from './photos'
import ErrorBoundary from './ErrorBoundary'
import StepLanding from './components/StepLanding'
import Step1PostcodeEntry from './components/Step1PostcodeEntry'
import StepCommute from './components/StepCommute'
import Step2Priorities from './components/Step2Priorities'
import StepLoading from './components/StepLoading'
import Step3Results from './components/Step3Results'
import StepListings from './components/StepListings'
import StepDashboard from './components/StepDashboard'

const pageVariants = {
  initial: { opacity: 0, x: 60, scale: 0.97 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -60, scale: 0.97 },
}
const pageTransition = { duration: 0.45, ease: [0.22, 1, 0.36, 1] }

export default function App() {
  const [step, setStep] = useState(0)
  const [postcode, setPostcode] = useState('')
  const [commuteMode, setCommuteMode] = useState('transit')
  const [priorities, setPriorities] = useState({
    safety: 8, convenience: 6, cost: 4, entertainment: 2,
  })
  const [commuteTimes, setCommuteTimes] = useState(null)
  const [heroBgUrl, setHeroBgUrl] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [sessionCode, setSessionCode] = useState(null)
  const [authorName, setAuthorName] = useState('')
  const [authorColor, setAuthorColor] = useState('#E76F51')
  const [listingsDirection, setListingsDirection] = useState('toWork')
  const [listingsDepartTime, setListingsDepartTime] = useState('0830')
  const [dashboardInitialTab, setDashboardInitialTab] = useState('locations')
  const [pendingLocation, setPendingLocation] = useState(null)
  const [runtimeError, setRuntimeError] = useState(null)

  useEffect(() => {
    fetchBackgroundPhoto().then(url => { if (url) setHeroBgUrl(url) })
  }, [])

  // Catch async / non-render errors that React's ErrorBoundary can't see
  // (Leaflet teardown, fetch handlers, setTimeout callbacks, etc.).
  useEffect(() => {
    const onError = e => setRuntimeError(String(e.error?.message ?? e.message ?? e))
    const onRejection = e => setRuntimeError(`Unhandled promise: ${String(e.reason?.message ?? e.reason)}`)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const handleReset = useCallback(() => {
    setStep(0)
    setPostcode('')
    setCommuteMode('transit')
    setPriorities({ safety: 8, convenience: 6, cost: 4, entertainment: 2 })
    setCommuteTimes(null)
    setSelectedLocation(null)
    setListingsDirection('toWork')
    setListingsDepartTime('0830')
    setDashboardInitialTab('locations')
    setPendingLocation(null)
  }, [])

  const handleViewListings = useCallback((location) => {
    setSelectedLocation(location)
    setStep(6)
  }, [])

  const handleSessionReady = useCallback((code, name, color) => {
    setSessionCode(code)
    setAuthorName(name)
    setAuthorColor(color)
    setStep(7)
  }, [])

  const handleOpenDashboardFromListings = useCallback((mode, location) => {
    const openOpinions = mode === 'opinions'
    setDashboardInitialTab(openOpinions ? 'opinions' : 'locations')
    setPendingLocation(openOpinions ? null : location)
    setStep(7)
  }, [])

  const showNav = step >= 1 && step <= 3

  const STEP_NAMES = ['Landing', 'Postcode', 'Commute', 'Priorities', 'Loading', 'Results', 'Listings', 'Dashboard']

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Debug tag — helps describe issues when reporting */}
      <div style={{
        position: 'fixed', bottom: 10, right: 10, zIndex: 200,
        padding: '6px 10px',
        background: 'rgba(26, 53, 40, 0.88)',
        color: '#F4F0E6',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1.5,
        borderRadius: 4,
        letterSpacing: '0.03em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        pointerEvents: 'none',
        userSelect: 'text',
      }}>
        step {step} · {STEP_NAMES[step] ?? '?'}
        {selectedLocation && ` · loc:${selectedLocation.name}`}
        {sessionCode && ` · sess:${sessionCode}`}
        {runtimeError && (
          <div style={{ marginTop: 4, color: '#FFB4A2', maxWidth: 320, whiteSpace: 'normal' }}>
            ⚠ {runtimeError}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {step > 0 && step < 5 && (
        <motion.div
          style={{ position: 'fixed', top: 0, left: 0, height: '2px', background: '#233632', zIndex: 100 }}
          animate={{ width: `${(Math.min(step, 4) / 4) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
      )}

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(26, 53, 40, 0.12)',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
          onClick={() => setStep(0)}
        >
          <div style={{
            width: 34, height: 34, background: '#1A3528',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 700,
            color: '#FFFFFF', letterSpacing: '0.05em',
          }}>VF</div>
          <span style={{
            fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: '15px',
            letterSpacing: '0.12em', color: '#1A3528', textTransform: 'uppercase',
          }}>HomeFind UK</span>
        </motion.div>

        {showNav && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {[{ num: 1, label: 'Location' }, { num: 2, label: 'Commute' }, { num: 3, label: 'Priorities' }].map(({ num, label }) => (
              <div key={num} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <motion.div
                  title={label}
                  animate={{ background: num <= step ? '#1A3528' : 'transparent', scale: num === step ? 1.1 : 1 }}
                  style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600,
                    color: num <= step ? '#FFFFFF' : 'rgba(26,53,40,0.42)',
                    cursor: num < step ? 'pointer' : 'default',
                    border: num === step ? '1.5px solid #1A3528' : '1px solid rgba(26,53,40,0.20)',
                  }}
                  onClick={() => num < step && setStep(num)}
                >{num}</motion.div>
                {num < 3 && (
                  <div style={{ width: 20, height: 1, background: num < step ? '#1A3528' : 'rgba(26,53,40,0.16)' }} />
                )}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 10, minHeight: '100vh',
        display: 'flex', alignItems: (step === 0 || step === 7) ? 'flex-start' : 'center', justifyContent: 'center',
        padding: (step === 0 || step === 7) ? '0' : '100px 20px 60px',
      }}>
        <ErrorBoundary>
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="landing" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} style={{ width: '100%' }}>
              <StepLanding onStart={() => setStep(1)} heroBgUrl={heroBgUrl} />
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="step1" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} style={{ width: '100%', maxWidth: '600px' }}>
              <Step1PostcodeEntry
                postcode={postcode}
                setPostcode={setPostcode}
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
              />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="step2" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} style={{ width: '100%', maxWidth: '600px' }}>
              <StepCommute postcode={postcode} commuteMode={commuteMode} setCommuteMode={setCommuteMode} onBack={() => setStep(1)} onNext={() => setStep(3)} />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="step3" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} style={{ width: '100%', maxWidth: '800px' }}>
              <Step2Priorities priorities={priorities} setPriorities={setPriorities} postcode={postcode} onBack={() => setStep(2)} onNext={() => setStep(4)} />
            </motion.div>
          )}
          {step === 4 && (
            <motion.div key="loading" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} style={{ width: '100%', maxWidth: '500px' }}>
              <StepLoading postcode={postcode} onCommuteTimes={setCommuteTimes} onPhotoUrls={() => {}} onDone={() => setStep(5)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Steps 5, 6 and 7 live OUTSIDE AnimatePresence on purpose.
            AnimatePresence intermittently refuses to mount heavier screens
            (results list, Leaflet map, dashboard polling) — no error, no warning,
            just a silent blank page. Rendering them as plain siblings guarantees
            they always show. */}
        {step === 5 && (
          <div style={{ width: '100%', maxWidth: '760px' }}>
            <Step3Results
              priorities={priorities}
              postcode={postcode}
              commuteMode={commuteMode}
              commuteTimes={commuteTimes}
              onBack={() => setStep(3)}
              onReset={handleReset}
              onViewListings={handleViewListings}
            />
          </div>
        )}
        {step === 6 && selectedLocation && (
          <div style={{ width: '100%', maxWidth: '760px' }}>
            <StepListings
              location={selectedLocation}
              postcode={postcode}
              commuteMode={commuteMode}
              direction={listingsDirection}
              setDirection={setListingsDirection}
              departTime={listingsDepartTime}
              setDepartTime={setListingsDepartTime}
              onBack={() => setStep(5)}
              sessionCode={sessionCode}
              onOpenDashboard={(mode) => handleOpenDashboardFromListings(mode, selectedLocation)}
            />
          </div>
        )}
        {step === 7 && (
          <div style={{ width: '100%' }}>
            <StepDashboard
              sessionCode={sessionCode}
              authorName={authorName}
              authorColor={authorColor}
              onSessionReady={handleSessionReady}
              onBack={() => setStep(selectedLocation ? 6 : 5)}
              pendingLocation={pendingLocation}
              initialTab={dashboardInitialTab}
              onPendingHandled={() => setPendingLocation(null)}
            />
          </div>
        )}
        </ErrorBoundary>
      </div>
    </div>
  )
}

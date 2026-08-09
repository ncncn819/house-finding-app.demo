import { useEffect, useRef, useState } from 'react'
import AggregatePanel from './dashboard/AggregatePanel'
import BoardCanvas from './dashboard/BoardCanvas'
import OpinionsPane from './dashboard/OpinionsPane'
import SessionSetup from './dashboard/SessionSetup'
import styles from './StepDashboard.module.css'

const API = 'http://localhost:8000/api/v1'
const POLL_MS = 3000

export default function StepDashboard({
  sessionCode,
  authorName,
  authorColor,
  onSessionReady,
  onBack,
  pendingLocation,
  initialTab = 'locations',
  onPendingHandled,
}) {
  const [showSetup, setShowSetup] = useState(!sessionCode)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [pins, setPins] = useState([])
  const [memos, setMemos] = useState([])
  const [opinions, setOpinions] = useState([])
  const [copied, setCopied] = useState(false)
  const pollRef = useRef(null)
  const pendingHandledRef = useRef(false)

  // Derive participant names from board activity
  const participants = [...new Set([
    ...pins.map(p => p.author_name),
    ...memos.map(m => m.author_name),
    ...opinions.map(o => o.author_name),
  ])]

  async function fetchSession() {
    if (!sessionCode) return
    try {
      const res = await fetch(`${API}/sessions/${sessionCode}`)
      if (!res.ok) return
      const data = await res.json()
      setPins(data.pins ?? [])
      setMemos(data.memos ?? [])
      setOpinions(data.opinions ?? [])
    } catch { /* network blip — keep previous state */ }
  }

  useEffect(() => {
    if (!sessionCode || showSetup) return
    fetchSession()
    pollRef.current = setInterval(fetchSession, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [sessionCode, showSetup])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab, sessionCode])

  // Auto-pin the location the user brought from StepListings after session is ready
  useEffect(() => {
    if (!sessionCode || showSetup || !pendingLocation || pendingHandledRef.current) return
    pendingHandledRef.current = true
    fetch(`${API}/sessions/${sessionCode}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: authorName,
        author_color: authorColor,
        location_data: JSON.stringify(pendingLocation),
        pos_x: 80 + Math.random() * 300,
        pos_y: 80 + Math.random() * 200,
      }),
    })
      .then(() => fetchSession())
      .finally(() => onPendingHandled?.())
  }, [sessionCode, showSetup, pendingLocation, authorName, authorColor])

  function handleSessionReady(code, name, color) {
    onSessionReady(code, name, color)
    setShowSetup(false)
  }

  async function copyCode() {
    await navigator.clipboard.writeText(sessionCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={styles.page}>
      {showSetup && (
        <SessionSetup
          onSessionReady={handleSessionReady}
          onClose={() => { if (sessionCode) setShowSetup(false); else onBack() }}
        />
      )}

      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Results</button>

        <div className={styles.topCenter}>
          <h1 className={styles.pageTitle}>Group Dashboard</h1>
          {sessionCode && (
            <button className={styles.codeChip} onClick={copyCode} title="Copy session code">
              {sessionCode} {copied ? '✓' : '⧉'}
            </button>
          )}
        </div>

        <div className={styles.participants}>
          {participants.map(name => (
            <span key={name} className={styles.participantChip}>{name[0].toUpperCase()}</span>
          ))}
          {sessionCode && (
            <button className={styles.inviteBtn} onClick={() => setShowSetup(true)} title="Invite flatmates">
              + Invite
            </button>
          )}
        </div>
      </div>

      {sessionCode && (
        <div className={styles.tabStrip}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'opinions' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('opinions')}
          >
            App Feedback
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'locations' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('locations')}
          >
            Locations & Roommate
          </button>
        </div>
      )}

      {/* Board */}
      {sessionCode ? (
        activeTab === 'locations' ? (
          <>
            <BoardCanvas
              pins={pins}
              memos={memos}
              sessionCode={sessionCode}
              authorName={authorName}
              authorColor={authorColor}
              onRefresh={fetchSession}
            />
            <AggregatePanel pins={pins} />
          </>
        ) : (
          <OpinionsPane
            sessionCode={sessionCode}
            authorName={authorName}
            authorColor={authorColor}
            opinions={opinions}
            onRefresh={fetchSession}
          />
        )
      ) : (
        <div className={styles.noSession}>
          <p>No active session. <button className={styles.linkBtn} onClick={() => setShowSetup(true)}>Create or join one.</button></p>
        </div>
      )}
    </div>
  )
}

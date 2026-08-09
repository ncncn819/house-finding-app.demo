import { useState } from 'react'
import styles from './SessionSetup.module.css'

const PRESET_COLORS = ['#E76F51', '#2A9D8F', '#E9C46A', '#6A4C93', '#457B9D', '#E63946']

const API = 'http://localhost:8000/api/v1'

export default function SessionSetup({ onSessionReady, onClose }) {
  const [mode, setMode] = useState('create') // 'create' | 'join'
  const [joinCode, setJoinCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!nickname.trim()) { setError('Please enter a nickname.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) throw new Error('Failed to create session')
      const { code } = await res.json()
      await navigator.clipboard.writeText(code).catch(() => {})
      onSessionReady(code, nickname.trim(), color)
    } catch {
      setError('Could not create session. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (!code || code.length !== 6) { setError('Enter a valid 6-character code.'); return }
    if (!nickname.trim()) { setError('Please enter a nickname.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/sessions/${code}`)
      if (res.status === 404) throw new Error('Session not found.')
      if (!res.ok) throw new Error('Failed to join session.')
      onSessionReady(code, nickname.trim(), color)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
        <h2 className={styles.title}>Group Dashboard</h2>
        <p className={styles.sub}>Share opinions with your flatmates on one board.</p>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${mode === 'create' ? styles.tabActive : ''}`} onClick={() => { setMode('create'); setError('') }}>
            Create New
          </button>
          <button className={`${styles.tab} ${mode === 'join' ? styles.tabActive : ''}`} onClick={() => { setMode('join'); setError('') }}>
            Join Existing
          </button>
        </div>

        <div className={styles.fields}>
          {mode === 'join' && (
            <div className={styles.field}>
              <label className={styles.label}>Session Code</label>
              <input
                className={styles.input}
                placeholder="e.g. XK9P2M"
                maxLength={6}
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Your Nickname</label>
            <input
              className={styles.input}
              placeholder="e.g. Alex"
              maxLength={30}
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Pick a Colour</label>
            <div className={styles.colorRow}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={`${styles.colorDot} ${color === c ? styles.colorDotActive : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          className={styles.confirmBtn}
          onClick={mode === 'create' ? handleCreate : handleJoin}
          disabled={loading}
        >
          {loading ? 'Loading…' : mode === 'create' ? 'Create & Copy Code' : 'Join Dashboard'}
        </button>

        {mode === 'create' && (
          <p className={styles.hint}>Your session code will be copied to clipboard so you can share it with flatmates.</p>
        )}
      </div>
    </div>
  )
}

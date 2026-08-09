import { useState } from 'react'
import styles from './PinCard.module.css'

const API = 'http://localhost:8000/api/v1'

export default function PinCard({ pin, sessionCode, authorName, authorColor, onDelete, onCommentAdded, onMouseDown }) {
  const location = JSON.parse(pin.location_data)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [pinConfirm, setPinConfirm] = useState('')

  async function handleSendComment(e) {
    e.preventDefault()
    if (!commentText.trim()) return
    setSending(true)
    try {
      const res = await fetch(`${API}/sessions/${sessionCode}/pins/${pin.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name: authorName, author_color: authorColor, content: commentText.trim() }),
      })
      if (res.ok) {
        setCommentText('')
        onCommentAdded?.()
      }
    } finally {
      setSending(false)
    }
  }

  async function handleDelete() {
    await fetch(`${API}/sessions/${sessionCode}/pins/${pin.id}`, { method: 'DELETE' })
    onDelete?.(pin.id)
  }

  const imageUrl = location.imageUrl || location.image_url
  const score = location.displayScore ?? location.rank_score ?? '—'
  const commute = location.commuteTime ?? location.commute_time_mins

  return (
    <div
      className={styles.card}
      style={{ left: pin.pos_x, top: pin.pos_y }}
      onMouseDown={onMouseDown}
    >
      {/* drag handle — subtle top bar */}
      <div className={styles.dragHandle}>
        <span className={styles.dragDots}>⠿</span>
        <button className={styles.deleteBtn} onMouseDown={e => e.stopPropagation()} onClick={handleDelete} title="Unpin">✕</button>
      </div>

      {/* hero image */}
      {imageUrl && (
        <div className={styles.hero} style={{ backgroundImage: `url(${imageUrl})` }}>
          <div className={styles.heroOverlay} />
          <div className={styles.heroText}>
            <span className={styles.locName}>{location.name}</span>
            <span className={styles.locBorough}>{location.borough}</span>
          </div>
        </div>
      )}

      {!imageUrl && (
        <div className={styles.heroPlain}>
          <span className={styles.locName}>{location.name}</span>
          <span className={styles.locBorough}>{location.borough}</span>
        </div>
      )}

      {/* stats row */}
      <div className={styles.stats}>
        <span className={styles.stat}>
          <span className={styles.statIcon}>★</span>
          <span>{typeof score === 'number' ? score.toFixed(0) : score}</span>
        </span>
        {commute != null && (
          <span className={styles.stat}>
            <span className={styles.statIcon}>🚇</span>
            <span>{commute} min</span>
          </span>
        )}
        {location.avgRent && (
          <span className={styles.stat}>
            <span className={styles.statIcon}>£</span>
            <span>{location.avgRent}</span>
          </span>
        )}
      </div>

      {/* author chip */}
      <div className={styles.author}>
        <span className={styles.authorDot} style={{ background: pin.author_color }} />
        <span className={styles.authorName}>{pin.author_name}</span>
      </div>

      {/* comments list */}
      {pin.comments && pin.comments.length > 0 && (
        <ul className={styles.commentList}>
          {pin.comments.map(c => (
            <li key={c.id} className={styles.comment}>
              <span className={styles.commentDot} style={{ background: c.author_color }} />
              <span className={styles.commentAuthor}>{c.author_name}:</span>
              <span className={styles.commentText}>{c.content}</span>
            </li>
          ))}
        </ul>
      )}

      {/* comment input */}
      <form className={styles.commentForm} onSubmit={handleSendComment} onMouseDown={e => e.stopPropagation()}>
        <textarea
          className={styles.commentInput}
          placeholder="Add a comment…"
          rows={2}
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(e) } }}
        />
        <button className={styles.sendBtn} type="submit" disabled={sending || !commentText.trim()}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

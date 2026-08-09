import { useRef, useState } from 'react'
import styles from './MemoNote.module.css'

const API = 'http://localhost:8000/api/v1'

// Gives each memo a slight deterministic tilt so they look like sticky notes
function tiltDeg(id) {
  const n = id.charCodeAt(0) + id.charCodeAt(id.length - 1)
  return ((n % 7) - 3) * 0.6 // -1.8° to +1.8°
}

// Lighten an author hex color to use as background
function lightenHex(hex, amount = 0.82) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = v => Math.round(v + (255 - v) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

export default function MemoNote({ memo, sessionCode, onDelete, onUpdate, onMouseDown }) {
  const [content, setContent] = useState(memo.content)
  const saveTimer = useRef(null)

  function handleChange(e) {
    const val = e.target.value
    setContent(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(val), 800)
  }

  async function save(text) {
    await fetch(`${API}/sessions/${sessionCode}/memos/${memo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })
    onUpdate?.()
  }

  async function handleDelete() {
    await fetch(`${API}/sessions/${sessionCode}/memos/${memo.id}`, { method: 'DELETE' })
    onDelete?.(memo.id)
  }

  const bg = lightenHex(memo.author_color)
  const tilt = tiltDeg(memo.id)

  return (
    <div
      className={styles.note}
      style={{ left: memo.pos_x, top: memo.pos_y, background: bg, transform: `rotate(${tilt}deg)` }}
      onMouseDown={onMouseDown}
    >
      <div className={styles.topBar}>
        <span className={styles.authorLabel} style={{ color: memo.author_color }}>{memo.author_name}</span>
        <button
          className={styles.deleteBtn}
          onMouseDown={e => e.stopPropagation()}
          onClick={handleDelete}
          title="Delete note"
        >✕</button>
      </div>

      <textarea
        className={styles.textarea}
        value={content}
        onChange={handleChange}
        placeholder="Write a note…"
        onMouseDown={e => e.stopPropagation()}
      />
    </div>
  )
}

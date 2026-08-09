import { useRef, useState } from 'react'
import PinCard from './PinCard'
import MemoNote from './MemoNote'
import styles from './BoardCanvas.module.css'

const API = 'http://localhost:8000/api/v1'

export default function BoardCanvas({ pins, memos, sessionCode, authorName, authorColor, onRefresh }) {
  const canvasRef = useRef(null)
  const dragRef = useRef(null) // { type, id, startX, startY, startPosX, startPosY }
  const [localPositions, setLocalPositions] = useState({}) // { `pin-{id}` or `memo-{id}`: {x, y} }

  function getPos(type, item) {
    const key = `${type}-${item.id}`
    return localPositions[key] ?? { x: item.pos_x, y: item.pos_y }
  }

  function startDrag(e, type, item) {
    if (e.button !== 0) return
    e.preventDefault()
    const pos = getPos(type, item)
    dragRef.current = { type, id: item.id, startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }

    function onMove(e) {
      const { startX, startY, startPosX, startPosY, id, type } = dragRef.current
      const nx = Math.max(0, startPosX + (e.clientX - startX))
      const ny = Math.max(0, startPosY + (e.clientY - startY))
      setLocalPositions(prev => ({ ...prev, [`${type}-${id}`]: { x: nx, y: ny } }))
    }

    async function onUp(e) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const { type, id } = dragRef.current
      const key = `${type}-${id}`
      const finalPos = localPositions[key] ?? { x: item.pos_x, y: item.pos_y }
      // Persist position
      const path = type === 'pin'
        ? `${API}/sessions/${sessionCode}/pins/${id}`
        : `${API}/sessions/${sessionCode}/memos/${id}`
      await fetch(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos_x: finalPos.x, pos_y: finalPos.y }),
      })
      dragRef.current = null
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function addMemo() {
    // Place new memo at a random position within the visible area
    const canvas = canvasRef.current
    const maxX = canvas ? canvas.offsetWidth - 200 : 400
    const maxY = canvas ? canvas.offsetHeight - 160 : 300
    const pos_x = 60 + Math.random() * Math.max(60, maxX - 60)
    const pos_y = 60 + Math.random() * Math.max(60, maxY - 60)
    await fetch(`${API}/sessions/${sessionCode}/memos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name: authorName, author_color: authorColor, content: '', pos_x, pos_y }),
    })
    onRefresh()
  }

  function handleDelete(type, id) {
    setLocalPositions(prev => { const n = { ...prev }; delete n[`${type}-${id}`]; return n })
    onRefresh()
  }

  return (
    <div className={styles.canvas} ref={canvasRef}>
      <button className={styles.addMemoBtn} onClick={addMemo} title="Add a sticky note">
        + Add Note
      </button>

      {pins.map(pin => {
        const pos = getPos('pin', pin)
        return (
          <PinCard
            key={pin.id}
            pin={{ ...pin, pos_x: pos.x, pos_y: pos.y }}
            sessionCode={sessionCode}
            authorName={authorName}
            authorColor={authorColor}
            onDelete={id => handleDelete('pin', id)}
            onCommentAdded={onRefresh}
            onMouseDown={e => startDrag(e, 'pin', pin)}
          />
        )
      })}

      {memos.map(memo => {
        const pos = getPos('memo', memo)
        return (
          <MemoNote
            key={memo.id}
            memo={{ ...memo, pos_x: pos.x, pos_y: pos.y }}
            sessionCode={sessionCode}
            onDelete={id => handleDelete('memo', id)}
            onUpdate={onRefresh}
            onMouseDown={e => startDrag(e, 'memo', memo)}
          />
        )
      })}

      {pins.length === 0 && memos.length === 0 && (
        <div className={styles.emptyHint}>
          <p>📌 Open a location report and tap <strong>Pin & Open Group Dashboard</strong> to pin it here.</p>
          <p>Click <strong>+ Add Note</strong> above to leave a sticky note.</p>
        </div>
      )}
    </div>
  )
}

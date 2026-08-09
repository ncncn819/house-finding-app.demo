import { useMemo, useState } from 'react'
import { buildOpinionRows, postOpinion } from './opinions'
import styles from './OpinionsPane.module.css'

const API = 'http://localhost:8000/api/v1'

export default function OpinionsPane({
  sessionCode,
  authorName,
  authorColor,
  opinions,
  onRefresh,
}) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [postError, setPostError] = useState('')

  const rows = useMemo(() => buildOpinionRows(opinions), [opinions])
  const canPost = Boolean(sessionCode && authorName?.trim() && authorColor)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || !canPost) return

    setSending(true)
    setPostError('')
    try {
      await postOpinion({
        apiBase: API,
        sessionCode,
        authorName,
        authorColor,
        content: trimmed,
      })
      setContent('')
      onRefresh?.()
    } catch (err) {
      console.error('[OpinionsPane] failed to post opinion', err)
      setPostError(err?.message || 'Could not post feedback. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>App Feedback / Opinions</h2>
        <p className={styles.sub}>Share quick thoughts about the HomeFind UK app experience.</p>
      </div>

      <div className={styles.feed}>
        {rows.length === 0 ? (
          <div className={styles.empty}>No feedback yet. Be the first to post.</div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className={styles.item}>
              <div className={styles.itemMeta}>
                <span className={styles.dot} style={{ background: row.authorColor }} />
                <span className={styles.author}>{row.author}</span>
                {row.relativeTime && <span className={styles.time}>· {row.relativeTime}</span>}
              </div>
              <p className={styles.content}>{row.content}</p>
            </article>
          ))
        )}
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        {!canPost && (
          <p className={styles.error}>
            Join or create a dashboard session first, then set a nickname to post feedback.
          </p>
        )}
        {postError && <p className={styles.error}>{postError}</p>}
        <textarea
          className={styles.input}
          rows={3}
          placeholder="Share feedback about the app flow, design, or data quality…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button className={styles.postBtn} type="submit" disabled={sending || !content.trim() || !canPost}>
          {sending ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  )
}

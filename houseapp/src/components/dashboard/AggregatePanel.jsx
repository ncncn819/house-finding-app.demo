import { useMemo } from 'react'
import styles from './AggregatePanel.module.css'

export default function AggregatePanel({ pins }) {
  const rankings = useMemo(() => {
    const groups = {}
    pins.forEach(pin => {
      try {
        const loc = JSON.parse(pin.location_data)
        const name = loc.name
        if (!groups[name]) {
          groups[name] = { name, borough: loc.borough, totalScore: 0, pinCount: 0, authors: [] }
        }
        groups[name].pinCount++
        groups[name].totalScore += loc.displayScore ?? loc.rank_score ?? 70
        if (!groups[name].authors.includes(pin.author_name)) {
          groups[name].authors.push(pin.author_name)
        }
      } catch { /* skip malformed */ }
    })
    return Object.values(groups)
      .map(g => ({ ...g, avgScore: g.totalScore / g.pinCount }))
      .sort((a, b) => (b.pinCount * b.avgScore) - (a.pinCount * a.avgScore))
      .slice(0, 5)
  }, [pins])

  if (rankings.length === 0) return null

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>🤝 Group Consensus</h3>
      <p className={styles.sub}>Locations ranked by how many people pinned them and their average score.</p>
      <ol className={styles.list}>
        {rankings.map((item, i) => (
          <li key={item.name} className={styles.item}>
            <span className={styles.rank}>{i + 1}</span>
            <div className={styles.info}>
              <span className={styles.locName}>{item.name}</span>
              <span className={styles.locBorough}>{item.borough}</span>
            </div>
            <div className={styles.right}>
              <span className={styles.pinCount}>📌 {item.pinCount}</span>
              <span className={styles.score}>{Math.round(item.avgScore)}</span>
            </div>
            <div className={styles.authors}>
              {item.authors.map(a => (
                <span key={a} className={styles.authorChip}>{a}</span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const { error } = this.state
    return (
      <div style={{
        maxWidth: 640, margin: '120px auto', padding: 24,
        background: '#FFF3F2', border: '1px solid #CF142B33',
        borderRadius: 6, fontFamily: 'Raleway, sans-serif', color: '#1A3528',
      }}>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 20, margin: 0, color: '#CF142B' }}>
          Something went wrong
        </h2>
        <p style={{ marginTop: 8, fontSize: 14 }}>
          {String(error?.message || error)}
        </p>
        <pre style={{
          marginTop: 12, padding: 12, background: '#fff',
          border: '1px solid #ddd', borderRadius: 4, fontSize: 12,
          overflow: 'auto', maxHeight: 280, whiteSpace: 'pre-wrap',
        }}>{error?.stack}</pre>
        <button
          onClick={() => { this.setState({ error: null }); window.location.reload() }}
          style={{
            marginTop: 16, padding: '10px 18px', background: '#1A3528',
            color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
            fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: '0.1em',
          }}
        >RELOAD</button>
      </div>
    )
  }
}

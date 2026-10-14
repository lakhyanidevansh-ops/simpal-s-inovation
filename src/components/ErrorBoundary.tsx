import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crash', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0b0d10',
            color: '#e8edf4',
            padding: 24,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          <h1 style={{ color: '#e74c3c', fontSize: 18 }}>App failed to render</h1>
          <p style={{ color: '#8b95a5', fontSize: 13 }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: '#1f6feb',
              color: '#fff',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

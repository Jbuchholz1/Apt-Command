import { Component } from 'react';

/**
 * Top-level error boundary — catches uncaught render errors so the app shows
 * a graceful fallback instead of a white screen. Only activates on errors;
 * normal renders are unaffected.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console for debugging; in production this won't leak to users
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px 20px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#1e293b',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: '#64748b', marginBottom: 24, maxWidth: 480 }}>
            The app ran into an unexpected error. Please try reloading the page.
            If this keeps happening, contact support.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 20px',
              background: '#04144F',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 15,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, border: '2px solid #d32f2f', borderRadius: 8, background: '#ffebee', color: '#b71c1c' }}>
          <h3>⚠️ Coś poszło nie tak.</h3>
          <p>Wystąpił błąd w tym widoku. Twoje dane w innych sekcjach są bezpieczne.</p>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: 10, fontSize: 12 }}>
            {this.state.error && this.state.error.toString()}
          </details>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: 15, padding: '8px 16px', cursor: 'pointer' }}
          >
            Odśwież stronę (tracąc niezapisane zmiany)
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
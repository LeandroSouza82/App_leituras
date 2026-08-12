import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erro capturado pelo ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'Segoe UI, sans-serif',
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
            padding: '32px 24px',
            textAlign: 'center',
          }}>
            <h2 style={{ margin: '0 0 12px', fontSize: '1.6rem' }}>Algo deu errado</h2>
            <p style={{ margin: '0 0 20px', color: '#475569', lineHeight: 1.6 }}>
              O aplicativo encontrou um problema inesperado. Tente recarregar a tela para continuar.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                border: 'none',
                borderRadius: '10px',
                padding: '12px 20px',
                background: '#2563eb',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Recarregar app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

import { Component, type ReactNode } from 'react';

// Rede de segurança global: se qualquer componente rebentar durante o render,
// mostramos uma mensagem em vez de um ecrã em branco (o comportamento anterior,
// já que não havia error boundary nenhum na app).
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Erro capturado pela ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 600, margin: '80px auto', padding: 24, textAlign: 'center', fontFamily: 'sans-serif', color: '#C7CBD4' }}>
          <h2 style={{ color: '#EDE9E0' }}>Algo correu mal ao mostrar as notícias.</h2>
          <p>Tente recarregar a página. Se o problema persistir, os feeds podem estar temporariamente indisponíveis.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer', background: '#16233A', color: '#EDE9E0', border: '1px solid #2A3D57', borderRadius: 4 }}
          >
            ↻ Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

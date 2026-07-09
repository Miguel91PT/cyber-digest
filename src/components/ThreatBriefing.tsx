import { useState } from 'react';
import Markdown from 'react-markdown';
import type { Article } from '../types';

export function ThreatBriefing({ articles }: { articles: Article[] }) {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const generateBriefing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (articles.length === 0) return;
    setLoading(true);
    setError(null);
    setIsOpen(true);
    try {
      const response = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      });
      if (!response.ok) throw new Error('Failed to fetch briefing');
      const data = await response.json();
      setBriefing(data.summary);
    } catch (err) {
      console.error(err);
      setError('A geração da síntese IA falhou. Verifique o backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="item" style={{ borderLeftColor: 'var(--gold)', background: 'var(--surface)', padding: '24px', marginBottom: '40px', borderRadius: 'var(--radius)' }}>
      <div 
        className="region-head" 
        style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: isOpen ? '16px' : '0', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 style={{ fontSize: '20px' }}>Síntese Analítica IA</h2>
        <span className="region-flag ia">IA</span>
        
        <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--muted)' }}>
          (Notícias da última semana)
        </span>

        <button 
          className="refresh-btn" 
          style={{ marginLeft: 'auto' }}
          onClick={generateBriefing} 
          disabled={loading || articles.length === 0}
        >
          {loading ? 'A processar...' : 'Gerar Síntese'}
        </button>
        <button 
          className="refresh-btn" 
          style={{ marginLeft: '8px', padding: '3px 6px' }}
        >
          {isOpen ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      
      {isOpen && (
        <div className="ai-briefing-content" style={{ color: 'var(--body-text)', fontSize: '15px' }}>
          {loading ? (
            <span style={{ color: 'var(--gold)', fontFamily: '"IBM Plex Mono", monospace' }}>Sintetizando inteligência de ameaças...</span>
          ) : error ? (
            <span style={{ color: 'var(--crimson)' }}>{error}</span>
          ) : briefing ? (
            <Markdown>{briefing}</Markdown>
          ) : (
            <p style={{ color: 'var(--muted)', margin: 0 }}>
               Clique em "Gerar Síntese" para produzir um resumo automático e focado no panorama atual, priorizando o impacto em Portugal e na Europa.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


import { useState, useEffect } from 'react';
import { ArticleCard } from './components/ArticleCard';
import { ThreatBriefing } from './components/ThreatBriefing';
import type { Article } from './types';

export default function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  
  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/news');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setArticles(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const ptArticles = articles.filter(a => a.region === 'Portugal').slice(0, 5);
  const euArticles = articles.filter(a => a.region === 'Europa' || a.region === 'Europe' || a.region === 'Global/EU').slice(0, 5);
  const globalArticles = articles.filter(a => a.region === 'Global').slice(0, 5);

  return (
    <>
      <header>
        <div className="radar-wrap" aria-hidden="true">
          <svg viewBox="0 0 400 400" className="radar-svg">
            <circle cx="200" cy="200" r="170" className="ring"/>
            <circle cx="200" cy="200" r="128" className="ring"/>
            <circle cx="200" cy="200" r="86" className="ring"/>
            <circle cx="200" cy="200" r="44" className="ring"/>
            <circle cx="272" cy="150" r="3.5" className="blip blip-a"/>
            <circle cx="146" cy="268" r="3" className="blip blip-b"/>
            <circle cx="258" cy="258" r="3" className="blip blip-c"/>
            <g className="sweep"><line x1="200" y1="200" x2="200" y2="32" className="sweep-line"/></g>
            <circle cx="200" cy="200" r="4" className="center-dot"/>
          </svg>
        </div>
        <div className="header-inner">
          <div className="eyebrow">Digest diário de cibersegurança</div>
          <h1>Sinal</h1>
          <nav className="issue-nav" aria-label="Secções desta edição">
            <a href="#pt">Portugal</a>
            <a href="#ue">União Europeia</a>
            <a href="#global">Radar Global</a>
            <a href="#fontes">Fontes</a>
          </nav>
        </div>
      </header>

      <main>
        <ThreatBriefing articles={articles} />

        <section className="region pt" id="pt">
          <div className="region-head">
            <h2>Portugal</h2>
            <span className="region-flag pt">PT</span>
            <button className="refresh-btn" style={{ marginLeft: 'auto' }} onClick={fetchNews} disabled={loading}>
              {loading ? 'A sintonizar...' : '↻ Atualizar'}
            </button>
          </div>
          {loading ? (
            <p className="feed-loading">A sintonizar os feeds portugueses...</p>
          ) : ptArticles.length > 0 ? (
            ptArticles.map(a => <ArticleCard key={a.id} article={a} />)
          ) : (
            <p className="feed-error">Sem artigos recentes.</p>
          )}
        </section>

        <section className="region ue" id="ue">
          <div className="region-head">
            <h2>União Europeia</h2>
            <span className="region-flag ue">UE</span>
            <button className="refresh-btn" style={{ marginLeft: 'auto' }} onClick={fetchNews} disabled={loading}>
              {loading ? 'A sintonizar...' : '↻ Atualizar'}
            </button>
          </div>
          {loading ? (
            <p className="feed-loading">A sintonizar as diretivas europeias...</p>
          ) : euArticles.length > 0 ? (
            euArticles.map(a => <ArticleCard key={a.id} article={a} />)
          ) : (
            <p className="feed-error">Sem artigos recentes.</p>
          )}
        </section>

        <section className="region global" id="global">
          <div className="region-head">
            <h2>Radar Global</h2>
            <span className="region-flag global">MUNDO</span>
            <div className="live-badge" style={{ marginLeft: 'auto' }}>
              {loading ? 'a carregar' : 'ao vivo'}
            </div>
            <button className="refresh-btn" style={{ marginLeft: '8px' }} onClick={fetchNews} disabled={loading}>
              ↻ Atualizar agora
            </button>
          </div>
          <p className="live-sub">Atualiza-se automaticamente a partir de fontes internacionais. Histórias com ligação à Europa destacadas.</p>
          {loading ? (
            <p className="feed-loading">A sintonizar o radar mundial...</p>
          ) : globalArticles.length > 0 ? (
            globalArticles.map(a => <ArticleCard key={a.id} article={a} />)
          ) : (
            <p className="feed-error">Sem artigos recentes.</p>
          )}
        </section>

        <section className="sources" id="fontes">
          <div className="region-head">
            <h2>Fontes que sigo</h2>
          </div>
          <div className="source-cols">
            <div className="source-col">
              <h3 style={{ color: 'var(--azulejo)' }}>Portugal</h3>
              <div className="pills">
                <a href="https://www.cncs.gov.pt/" target="_blank" rel="noopener noreferrer">CNCS</a>
                <a href="https://news.google.com/" target="_blank" rel="noopener noreferrer">Google News PT</a>
              </div>
            </div>
            <div className="source-col">
              <h3 style={{ color: 'var(--gold)' }}>União Europeia</h3>
              <div className="pills">
                <a href="https://news.google.com/" target="_blank" rel="noopener noreferrer">Notícias NIS2/DORA</a>
                <a href="https://www.darkreading.com/" target="_blank" rel="noopener noreferrer">Dark Reading</a>
              </div>
            </div>
            <div className="source-col">
              <h3 style={{ color: 'var(--radar-green)' }}>Global</h3>
              <div className="pills">
                <a href="https://thehackernews.com/" target="_blank" rel="noopener noreferrer">The Hacker News</a>
                <a href="https://www.bleepingcomputer.com/" target="_blank" rel="noopener noreferrer">BleepingComputer</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        Sinal — Digest diário de cibersegurança<br/>
        <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', display: 'block' }}>
          Os artigos e inteligência apresentados provêm de feeds RSS públicos. Nota: O feed do CNCS é monitorizado via alertas do Google News devido a bloqueios de segurança (WAF) no site original.
        </span>
      </footer>
    </>
  );
}

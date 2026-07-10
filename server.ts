import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';

const PORT = 3000;
const rssParser = new Parser({
  customFields: {
    item: ['media:content', 'enclosure', 'content:encoded', 'description'],
  },
});

// Using Gemini for AI Summaries (Threat Briefing)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FEEDS = [
  // Ameaças, Vulnerabilidades e Ransomware
  { id: 'hn', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', region: 'Global', category: 'Ameaças' },
  { id: 'bc', name: 'Bleeping Computer', url: 'https://www.bleepingcomputer.com/feed/', region: 'Global', category: 'Ameaças' },
  { id: 'gnews-vuln', name: 'Google News - Vulnerabilities', url: 'https://news.google.com/rss/search?q=%22vulnerability%22+OR+%22zero-day%22+OR+%22ransomware%22+cybersecurity+when:7d&hl=en-US&gl=US&ceid=US:en', region: 'Global', category: 'Ameaças' },

  // Regulamentação / Compliance (NIS2, DORA, ISO 27001) - Europa e Global
  { id: 'gnews-nis2-dora', name: 'Google News - NIS2 & DORA', url: 'https://news.google.com/rss/search?q=%22NIS2%22+OR+%22DORA%22+cybersecurity+when:14d&hl=en-GB&gl=GB&ceid=GB:en', region: 'Europa', category: 'Regulamentação' },
  { id: 'gnews-iso27001', name: 'Google News - ISO 27001', url: 'https://news.google.com/rss/search?q=%22ISO+27001%22+cybersecurity+when:14d&hl=en-GB&gl=GB&ceid=GB:en', region: 'Global', category: 'Regulamentação' },

  // União Europeia — cobertura alargada além do NIS2/DORA: a ENISA (cuja própria RSS foi descontinuada),
  // ameaças/incidentes com alvo em instituições ou Estados-membros da UE, e notícias gerais de cibersegurança na UE.
  { id: 'gnews-eu-enisa', name: 'Google News - ENISA', url: 'https://news.google.com/rss/search?q=%22ENISA%22+OR+%22European+Union+Agency+for+Cybersecurity%22+when:14d&hl=en-GB&gl=GB&ceid=GB:en', region: 'Europa', category: 'Regulamentação' },
  { id: 'gnews-eu-threats', name: 'Google News - Ameaças UE', url: 'https://news.google.com/rss/search?q=(cyberattack+OR+%22data+breach%22+OR+ransomware)+(%22European+Union%22+OR+%22EU+institutions%22+OR+Europol)+when:14d&hl=en-GB&gl=GB&ceid=GB:en', region: 'Europa', category: 'Ameaças' },
  { id: 'gnews-eu-geral', name: 'Google News - Cibersegurança UE', url: 'https://news.google.com/rss/search?q=cybersecurity+%22European+Union%22+when:10d&hl=en-GB&gl=GB&ceid=GB:en', region: 'Europa', category: 'Geral' },

  // Portugal — foco exclusivo em compliance/legislação (NIS2, DORA, ISO 27001) com impacto direto ou indireto em Portugal e nas suas empresas.
  // Janela alargada para 30d (vs. 14d) porque queries em português, altamente específicas, têm volume baixo — 14d esgotava-se com frequência.
  { id: 'gnews-pt-nis2dora', name: 'Google News - NIS2 & DORA (PT)', url: 'https://news.google.com/rss/search?q=(%22NIS2%22+OR+%22DORA%22)+(portugal+OR+empresas+OR+ciberseguran%C3%A7a)+when:30d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'Regulamentação' },
  { id: 'gnews-pt-iso27001', name: 'Google News - ISO 27001 (PT)', url: 'https://news.google.com/rss/search?q=%22ISO+27001%22+(portugal+OR+empresas+OR+certifica%C3%A7%C3%A3o)+when:30d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'Regulamentação' },
  { id: 'gnews-cncs-regulacao', name: 'Google News - CNCS Regulação', url: 'https://news.google.com/rss/search?q=(%22CNCS%22+OR+%22Centro+Nacional+de+Ciberseguran%C3%A7a%22)+(NIS2+OR+%22regime+jur%C3%ADdico%22+OR+MyCiber+OR+regulamento+OR+DORA)+when:30d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'CNCS' },
];

async function startServer() {
  const app = express();
  
  app.use(express.json());

  app.get('/api/feeds', (req, res) => {
    res.json(FEEDS);
  });

  // Cache simples em memória: evita martelar as fontes a cada visita e serve
  // o último resultado bom conhecido se uma fetch falhar ou vier vazia.
  let newsCache: { data: any[]; timestamp: number } | null = null;
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
  const PER_FEED_CAP = 20; // evita que feeds prolíficos (HN, BleepingComputer) engulam feeds PT de baixo volume

  app.get('/api/news', async (req, res) => {
    const feedId = req.query.feed as string;
    const now = Date.now();

    // Pedidos sem filtro podem ser servidos direto da cache, se ainda válida
    if (!feedId && newsCache && (now - newsCache.timestamp) < CACHE_TTL_MS) {
      return res.json(newsCache.data);
    }

    try {
      const feedsToFetch = feedId ? FEEDS.filter(f => f.id === feedId) : FEEDS;

      let allArticles: any[] = [];

      await Promise.all(feedsToFetch.map(async (feed) => {
        try {
          const parsed = await rssParser.parseURL(feed.url);
          // Cap por feed ANTES de juntar tudo — impede que feeds de alto volume
          // (Global) empurrem para fora os feeds PT de baixo volume no corte final.
          const articles = parsed.items.slice(0, PER_FEED_CAP).map(item => {
            const parsedDate = item.pubDate ? new Date(item.pubDate) : null;
            const validDate = parsedDate && !isNaN(parsedDate.getTime());
            return {
              id: item.guid || item.link || `${feed.id}-${item.title}`,
              title: item.title,
              link: item.link,
              // Data inválida/ausente já não derruba o ecrã no cliente — cai para "agora".
              pubDate: validDate ? item.pubDate : new Date().toISOString(),
              source: feed.name,
              region: feed.region,
              category: feed.category,
              snippet: (item.contentSnippet || item.description || '').substring(0, 200) + '...',
            };
          });
          allArticles = allArticles.concat(articles);
        } catch (e) {
          console.error(`Error fetching feed ${feed.name}:`, e);
        }
      }));

      allArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      // Teto generoso (bem acima de 8 feeds × 20) — já não corta regiões de baixo volume.
      const result = allArticles.slice(0, 350);

      if (!feedId) {
        if (result.length > 0) {
          newsCache = { data: result, timestamp: now };
        } else if (newsCache) {
          // Fetch nova veio vazia (ex: Google News a bloquear) — serve a última boa em vez de nada.
          return res.json(newsCache.data);
        }
      }

      res.json(result);
    } catch (err) {
      console.error(err);
      if (!feedId && newsCache) {
        return res.json(newsCache.data); // falha total — mesma rede de segurança
      }
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });

  // Devolve os artigos atuais (cache válida, ou uma fetch nova) para uso interno do servidor.
  // Usado pelo /api/briefing para nunca depender de conteúdo enviado pelo cliente.
  async function getCurrentArticles(): Promise<any[]> {
    const now = Date.now();
    if (newsCache && (now - newsCache.timestamp) < CACHE_TTL_MS) {
      return newsCache.data;
    }
    try {
      let allArticles: any[] = [];
      await Promise.all(FEEDS.map(async (feed) => {
        try {
          const parsed = await rssParser.parseURL(feed.url);
          const articles = parsed.items.slice(0, PER_FEED_CAP).map(item => {
            const parsedDate = item.pubDate ? new Date(item.pubDate) : null;
            const validDate = parsedDate && !isNaN(parsedDate.getTime());
            return {
              id: item.guid || item.link || `${feed.id}-${item.title}`,
              title: item.title,
              link: item.link,
              pubDate: validDate ? item.pubDate : new Date().toISOString(),
              source: feed.name,
              region: feed.region,
              category: feed.category,
              snippet: (item.contentSnippet || item.description || '').substring(0, 200) + '...',
            };
          });
          allArticles = allArticles.concat(articles);
        } catch (e) {
          console.error(`Error fetching feed ${feed.name}:`, e);
        }
      }));
      allArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      const result = allArticles.slice(0, 350);
      if (result.length > 0) {
        newsCache = { data: result, timestamp: now };
        return result;
      }
      return newsCache ? newsCache.data : [];
    } catch (e) {
      console.error(e);
      return newsCache ? newsCache.data : [];
    }
  }

  // Rate limiting simples por IP, sem dependências novas — só relevante para
  // /api/briefing, que é o único endpoint que custa dinheiro real (chamada à Gemini).
  app.set('trust proxy', true); // necessário no Render para ler o IP real por trás do proxy
  const briefingRequestLog = new Map<string, number[]>();
  const BRIEFING_MAX_REQUESTS = 5;
  const BRIEFING_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
  function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const recent = (briefingRequestLog.get(ip) || []).filter(t => now - t < BRIEFING_WINDOW_MS);
    recent.push(now);
    briefingRequestLog.set(ip, recent);
    return recent.length > BRIEFING_MAX_REQUESTS;
  }

  let briefingCache: { summary: string; timestamp: number } | null = null;
  const BRIEFING_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos — a síntese não precisa de ser gerada de novo a cada clique

  app.post('/api/briefing', async (req, res) => {
    const now = Date.now();

    // Serve a síntese em cache se ainda for recente — evita custos repetidos por cliques repetidos
    if (briefingCache && (now - briefingCache.timestamp) < BRIEFING_CACHE_TTL_MS) {
      return res.json({ summary: briefingCache.summary });
    }

    const ip = req.ip || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Demasiados pedidos. Tenta novamente daqui a uns minutos.' });
    }

    try {
      // IMPORTANTE: os artigos vêm sempre dos dados já recolhidos pelo próprio servidor,
      // nunca do corpo do pedido — assim ninguém consegue injetar conteúdo arbitrário no
      // prompt da Gemini, nem gerar sínteses à conta da tua chave de API.
      const articles = await getCurrentArticles();
      if (!articles || articles.length === 0) {
        return res.json({ summary: 'Sem artigos suficientes para gerar uma síntese neste momento.' });
      }
      
      const promptText = `
        You are a senior cybersecurity analyst. Review the following recent news headlines and short snippets.
        Provide a concise, professional threat briefing summarizing the most critical news of the last week.
        Your primary audience are Enterprise CISOs and IT Directors. You MUST prioritize news regarding:
        - Major Vulnerabilities (Zero-days) and active Ransomware threats.
        - Regulatory Compliance, specifically NIS2, DORA, and ISO 27001 updates or impacts.
        - Strategic threats to European and Portuguese enterprises.

        Structure your response in exactly three short sections (use Markdown headings):
        ### Portugal
        (Focus on national threats, CNCS directives, local compliance impacts, and local enterprise context)
        
        ### União Europeia
        (Focus on EU regulations like NIS2/DORA, ENISA updates, and EU-wide threats)
        
        ### Mundo
        (Focus on the global landscape, major vulnerabilities, zero-days, and ransomware trends)

        CRITICAL INSTRUCTION: Your entire response MUST be written in strict European Portuguese (PT-PT), using formal and professional terminology suitable for a Portuguese cybersecurity professional. Do not use Brazilian Portuguese phrasing (e.g. use "utilizador" instead of "usuário", "ecrã" instead of "tela", "registo" instead of "registro").
        
        Articles:
        ${articles.slice(0, 40).map((a: any) => `- [${a.region}] ${a.title} (${a.source}): ${a.snippet}`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
      });

      briefingCache = { summary: response.text, timestamp: now };
      res.json({ summary: response.text });
    } catch (err) {
      console.error('Error generating briefing:', err);
      res.status(500).json({ error: 'Failed to generate briefing' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

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

// Regex de filtragem: aplicados a feeds genéricos para extrair apenas os itens
// relevantes para a região/tema em causa, já que deixámos de depender de pesquisas
// do Google News (confirmado: bloqueia pedidos automáticos vindos do Render com 503).
const EU_FILTER = /NIS2|DORA|ENISA|European Union|European Commission|Cyber Resilience Act|European Parliament|Europol/i;
const PT_COMPLIANCE_FILTER = /NIS2|DORA|ISO\s?27001|CNCS|regulamento|regime jur[ií]dico|conformidade|obrigatoriedade|Centro Nacional de Ciberseguran[cç]a/i;

const FEEDS: { id: string; name: string; url: string; region: string; category: string; filterKeywords?: RegExp }[] = [
  // Global — feeds nativos, sem dependência de pesquisa via motor de busca.
  { id: 'hn', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', region: 'Global', category: 'Ameaças' },
  { id: 'bc', name: 'Bleeping Computer', url: 'https://www.bleepingcomputer.com/feed/', region: 'Global', category: 'Ameaças' },

  // União Europeia — feeds nativos e genéricos, filtrados por palavras-chave para reter
  // só o que é efetivamente relevante para a UE (NIS2, DORA, ENISA, instituições europeias).
  { id: 'sw-eu', name: 'SecurityWeek (filtrado UE)', url: 'https://www.securityweek.com/feed', region: 'Europa', category: 'Regulamentação', filterKeywords: EU_FILTER },
  { id: 'dr-eu', name: 'Dark Reading (filtrado UE)', url: 'https://www.darkreading.com/rss.xml', region: 'Europa', category: 'Ameaças', filterKeywords: EU_FILTER },
  { id: 'krebs-eu', name: 'Krebs on Security (filtrado UE)', url: 'https://krebsonsecurity.com/feed/', region: 'Europa', category: 'Geral', filterKeywords: EU_FILTER },

  // Portugal — Pplware é o único feed nativo confirmado para uma fonte portuguesa.
  // Filtrado para compliance (NIS2/DORA/ISO27001/CNCS/legislação), como pedido — mas é
  // um blog de tecnologia generalista, por isso é normal que fique magro nalgumas semanas.
  // Solução própria para Portugal ainda por resolver — ver nota na resposta.
  { id: 'pplware-pt', name: 'Pplware (filtrado compliance)', url: 'https://pplware.sapo.pt/feed/', region: 'Portugal', category: 'Regulamentação', filterKeywords: PT_COMPLIANCE_FILTER },
];

async function startServer() {
  const app = express();
  
  app.use(express.json());

  app.get('/api/feeds', (req, res) => {
    res.json(FEEDS);
  });

  // Endpoint de diagnóstico: testa cada fonte individualmente e devolve o resultado real
  // (sucesso + nº de itens, ou o erro exato). Existe para não precisarmos de adivinhar
  // com base nos logs do Render — visita /api/debug/feeds e vê logo o que está a falhar.
  app.get('/api/debug/feeds', async (req, res) => {
    const results = await Promise.all(FEEDS.map(async (feed) => {
      const start = Date.now();
      try {
        const parsed = await rssParser.parseURL(feed.url);
        const matched = feed.filterKeywords
          ? parsed.items.filter(item => feed.filterKeywords!.test(`${item.title || ''} ${item.contentSnippet || item.description || ''}`))
          : parsed.items;
        return {
          id: feed.id,
          name: feed.name,
          region: feed.region,
          status: 'ok',
          rawItemCount: parsed.items.length,
          // Se há filtro, este é o nº que realmente chega ao site depois de filtrar.
          matchedItemCount: matched.length,
          firstTitle: matched[0]?.title || parsed.items[0]?.title || null,
          ms: Date.now() - start,
        };
      } catch (e: any) {
        return {
          id: feed.id,
          name: feed.name,
          region: feed.region,
          status: 'error',
          error: e?.message || String(e),
          ms: Date.now() - start,
        };
      }
    }));
    res.json({ checkedAt: new Date().toISOString(), results });
  });

  // Cache simples em memória: evita martelar as fontes a cada visita e serve
  // o último resultado bom conhecido se uma fetch falhar ou vier vazia.
  let newsCache: { data: any[]; timestamp: number } | null = null;
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
  const PER_FEED_CAP = 20; // evita que feeds prolíficos (HN, BleepingComputer) engulam feeds PT/UE de baixo volume

  // Função partilhada: faz fetch de UM feed, aplica filterKeywords se existir, e mapeia
  // para o formato de artigo usado em todo o site. Usada por /api/news e getCurrentArticles,
  // para não termos duas cópias da mesma lógica a divergir ao longo do tempo.
  async function fetchFeedItems(feed: typeof FEEDS[number]): Promise<any[]> {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      const source = feed.filterKeywords
        ? parsed.items.filter(item => feed.filterKeywords!.test(`${item.title || ''} ${item.contentSnippet || item.description || ''}`))
        : parsed.items;
      return source.slice(0, PER_FEED_CAP).map(item => {
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
    } catch (e) {
      console.error(`Error fetching feed ${feed.name}:`, e);
      return [];
    }
  }

  app.get('/api/news', async (req, res) => {
    const feedId = req.query.feed as string;
    const now = Date.now();

    // Pedidos sem filtro podem ser servidos direto da cache, se ainda válida
    if (!feedId && newsCache && (now - newsCache.timestamp) < CACHE_TTL_MS) {
      return res.json(newsCache.data);
    }

    try {
      const feedsToFetch = feedId ? FEEDS.filter(f => f.id === feedId) : FEEDS;
      const perFeedResults = await Promise.all(feedsToFetch.map(fetchFeedItems));
      let allArticles = perFeedResults.flat();

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
      const perFeedResults = await Promise.all(FEEDS.map(fetchFeedItems));
      const allArticles = perFeedResults.flat();
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

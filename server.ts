import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import rateLimit from 'express-rate-limit';

const PORT = 3000;
const rssParser = new Parser({
  customFields: {
    item: ['media:content', 'enclosure', 'content:encoded', 'description'],
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

// Using Gemini for AI Summaries (Threat Briefing)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FEEDS = [
  // Regulamentação, Risk & Compliance (Global & Europa)
  { id: 'cpo-mag', name: 'CPO Magazine', url: 'https://www.cpomagazine.com/feed/', region: 'Global', category: 'Regulamentação' },
  { id: 'dr-risk', name: 'Dark Reading - Risk', url: 'https://www.darkreading.com/rss.xml', region: 'Global', category: 'Regulamentação' },
  { id: 'gnews-reg', name: 'Google News - Cyber Regulation', url: 'https://news.google.com/rss/search?q=%22cybersecurity%22+AND+(%22compliance%22+OR+%22regulation%22+OR+%22CISO%22)+when:7d&hl=en-US&gl=US&ceid=US:en', region: 'Global', category: 'Regulamentação' },
  { id: 'gnews-nis2-dora', name: 'Google News - NIS2 & DORA', url: 'https://news.google.com/rss/search?q=%22NIS2%22+OR+%22DORA%22+cybersecurity+when:14d&hl=en-GB&gl=GB&ceid=GB:en', region: 'Europa', category: 'Regulamentação' },
  
  // Ameaças de Alto Nível (Ransomware, APTs)
  { id: 'gnews-vuln', name: 'Google News - Major Threats', url: 'https://news.google.com/rss/search?q=%22APT%22+OR+%22zero-day%22+OR+%22ransomware%22+cybersecurity+when:7d&hl=en-US&gl=US&ceid=US:en', region: 'Global', category: 'Ameaças' },
  
  // Portugal / CNCS / Regulamentação PT
  { id: 'gnews-pt-reg', name: 'Google News - Compliance PT', url: 'https://news.google.com/rss/search?q=(%22NIS2%22+OR+%22DORA%22+OR+%22RGPD%22+OR+%22Regime+Jur%C3%ADdico+da+Ciberseguran%C3%A7a%22)+AND+(%22Portugal%22+OR+%22portuguesas%22+OR+%22CNCS%22)+when:14d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'Regulamentação' },
  { id: 'gnews-cncs', name: 'Google News - CNCS', url: 'https://news.google.com/rss/search?q=(%22Centro+Nacional+de+Ciberseguran%C3%A7a%22+OR+%22CNCS%22)+AND+(%22Portugal%22+OR+%22ciberseguran%C3%A7a%22)+when:14d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'CNCS' },
  { id: 'gnews-pt-threats', name: 'Google News - Ameaças PT', url: 'https://news.google.com/rss/search?q=(%22ciberataque%22+OR+%22ransomware%22+OR+%22hacker%22+OR+%22ciberseguran%C3%A7a%22)+AND+(%22Portugal%22+OR+%22portuguesas%22+OR+%22CNCS%22)+when:14d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'Ameaças' },
];

let newsCache: { timestamp: number, data: any[] } | null = null;
const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

let briefingCache: { timestamp: number, summary: string } | null = null;
const BRIEFING_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchAllNews() {
  if (newsCache && (Date.now() - newsCache.timestamp < NEWS_CACHE_TTL)) {
    return newsCache.data;
  }
  
  let allArticles: any[] = [];
  await Promise.all(FEEDS.map(async (feed) => {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      const articles = parsed.items.map(item => ({
        id: item.guid || item.link || Math.random().toString(),
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        source: feed.name,
        region: feed.region,
        category: feed.category,
        snippet: (item.contentSnippet || item.description || '').substring(0, 200) + '...',
      }));
      allArticles = allArticles.concat(articles);
    } catch (e) {
      console.error(`Error fetching feed ${feed.name}:`, e);
    }
  }));

  // Sort by date descending
  allArticles.sort((a, b) => {
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });
  
  const top100 = allArticles.slice(0, 100);
  newsCache = { timestamp: Date.now(), data: top100 };
  return top100;
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
});

async function startServer() {
  const app = express();
  
  app.use(express.json());
  app.use('/api/', apiLimiter);

  app.get('/api/feeds', (req, res) => {
    res.json(FEEDS);
  });

  app.get('/api/news', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const allArticles = await fetchAllNews();
      const feedId = req.query.feed as string;
      if (feedId) {
        res.json(allArticles.filter(a => a.source === FEEDS.find(f => f.id === feedId)?.name));
      } else {
        res.json(allArticles);
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });
  
  app.post('/api/briefing', async (req, res) => {
    try {
      if (briefingCache && (Date.now() - briefingCache.timestamp < BRIEFING_CACHE_TTL)) {
        return res.json({ summary: briefingCache.summary });
      }

      const articles = await fetchAllNews();
      
      if (!articles || articles.length === 0) {
        return res.json({ summary: "No articles provided for briefing." });
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

        CRITICAL INSTRUCTION: Your entire response MUST be written in strict European Portuguese (PT-PT). Do not use Brazilian Portuguese phrasing.
        DO NOT include any introductory greetings, preambles, or opening paragraphs (e.g., do not say "Prezados CISOs..."). Start your response DIRECTLY with the first Markdown heading "### Portugal".
        
        Articles:
        ${articles.slice(0, 40).map((a: any) => `- [${a.region}] ${a.title} (${a.source}): ${a.snippet}`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
      });

      const summary = response.text;
      if (summary) {
        briefingCache = { timestamp: Date.now(), summary };
      }

      res.json({ summary });
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

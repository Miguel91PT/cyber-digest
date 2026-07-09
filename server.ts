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
  // Geral/Ameaças
  { id: 'hn', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', region: 'Global', category: 'Ameaças' },
  { id: 'bc', name: 'Bleeping Computer', url: 'https://www.bleepingcomputer.com/feed/', region: 'Global', category: 'Ameaças' },
  { id: 'dr', name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', region: 'Europa', category: 'Geral' },
  
  // Portugal / CNCS
  { id: 'gnews-pt', name: 'Google News - Cibersegurança PT', url: 'https://news.google.com/rss/search?q=ciberseguran%C3%A7a+portugal+when:7d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'Geral' },
  { id: 'gnews-cncs', name: 'Google News - CNCS', url: 'https://news.google.com/rss/search?q=%22Centro+Nacional+de+Ciberseguran%C3%A7a%22+OR+%22CNCS%22+portugal+when:7d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Portugal', category: 'CNCS' },
  
  // Regulamentação / Europa
  { id: 'gnews-eu', name: 'Google News - EU Cybersecurity', url: 'https://news.google.com/rss/search?q=cybersecurity+europe+when:7d&hl=en-GB&gl=GB&ceid=GB:en', region: 'Europa', category: 'Regulamentação' },
  { id: 'gnews-nis2', name: 'Google News - NIS2 & DORA', url: 'https://news.google.com/rss/search?q=%22NIS2%22+OR+%22DORA%22+OR+%22regulamenta%C3%A7%C3%A3o%22+ciberseguran%C3%A7a+when:7d&hl=pt-PT&gl=PT&ceid=PT:pt-150', region: 'Europa', category: 'Regulamentação' }
];

async function startServer() {
  const app = express();
  
  app.use(express.json());

  app.get('/api/feeds', (req, res) => {
    res.json(FEEDS);
  });

  app.get('/api/news', async (req, res) => {
    try {
      const feedId = req.query.feed as string;
      const feedsToFetch = feedId ? FEEDS.filter(f => f.id === feedId) : FEEDS;
      
      let allArticles: any[] = [];
      
      await Promise.all(feedsToFetch.map(async (feed) => {
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

      res.json(allArticles.slice(0, 100)); // Return top 100
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });
  
  app.post('/api/briefing', async (req, res) => {
    try {
      const { articles } = req.body;
      if (!articles || articles.length === 0) {
        return res.json({ summary: "No articles provided for briefing." });
      }
      
      const promptText = `
        You are a senior cybersecurity analyst. Review the following recent news headlines and short snippets.
        Provide a concise, professional threat briefing summarizing the most critical news of the last week.
        Structure your response in exactly three short sections (use Markdown headings):
        ### Portugal
        (Focus on national threats, CNCS directives, and local context)
        
        ### União Europeia
        (Focus on EU regulations like NIS2/DORA, ENISA updates, and EU-wide threats)
        
        ### Mundo
        (Focus on the global landscape, major vulnerabilities, and ransomware trends)

        CRITICAL INSTRUCTION: Your entire response MUST be written in strict European Portuguese (PT-PT), using formal and professional terminology suitable for a Portuguese cybersecurity professional. Do not use Brazilian Portuguese phrasing (e.g. use "utilizador" instead of "usuário", "ecrã" instead of "tela", "registo" instead of "registro").
        
        Articles:
        ${articles.slice(0, 40).map((a: any) => `- [${a.region}] ${a.title} (${a.source}): ${a.snippet}`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
      });

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

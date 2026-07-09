import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { Article } from '../types';

export function ArticleCard({ article }: { article: Article }) {
  let tagLabel = article.category || 'Geral';
  let tagClass = '';
  
  if (tagLabel === 'Ameaças') tagClass = 'critical';
  if (tagLabel === 'Regulamentação' || tagLabel === 'CNCS') tagClass = 'warn';

  let formattedDate = 'Data desconhecida';
  try {
    const date = new Date(article.pubDate);
    if (!isNaN(date.getTime())) {
      formattedDate = formatDistanceToNow(date, { addSuffix: true, locale: pt });
    } else if (article.pubDate) {
      formattedDate = article.pubDate;
    }
  } catch (e) {
    if (article.pubDate) formattedDate = article.pubDate;
  }

  return (
    <article className="item">
      <div className="item-meta">
        {tagLabel && <span className={`tag ${tagClass}`}>{tagLabel}</span>}
        {article.region.includes('Europ') && <span className="tag eu-badge">Europa</span>}
        <span>{article.source} · {formattedDate}</span>
      </div>
      <h3>
        <a href={article.link} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
      </h3>
      <p>{article.snippet}</p>
      <a className="source-link" href={article.link} target="_blank" rel="noopener noreferrer">
        {article.source}
      </a>
    </article>
  );
}


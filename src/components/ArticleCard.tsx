import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { Article } from '../types';

function safeRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return ''; // data inválida/ausente — não rebenta a página, só não mostra "há X"
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: pt });
  } catch {
    return '';
  }
}

export function ArticleCard({ article }: { article: Article }) {
  let tagLabel = article.category || 'Geral';
  let tagClass = '';
  
  if (tagLabel === 'Ameaças') tagClass = 'critical';
  if (tagLabel === 'Regulamentação' || tagLabel === 'CNCS') tagClass = 'warn';

  const relativeDate = safeRelativeDate(article.pubDate);

  return (
    <article className="item">
      <div className="item-meta">
        {tagLabel && <span className={`tag ${tagClass}`}>{tagLabel}</span>}
        {article.region.includes('Europ') && <span className="tag eu-badge">Europa</span>}
        <span>{article.source}{relativeDate ? ` · ${relativeDate}` : ''}</span>
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


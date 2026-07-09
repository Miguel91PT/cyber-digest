export interface Feed {
  id: string;
  name: string;
  url: string;
  region: string;
  category: string;
}

export interface Article {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  region: string;
  category: string;
  snippet: string;
}

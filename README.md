# Sinal — Digest Diário de Cibersegurança

Uma plataforma desenvolvida para monitorizar, agregar e resumir o panorama de cibersegurança e compliance (NIS2, DORA, ISO 27001), com foco em Portugal, Europa e impacto global. Desenvolvido para CISO e equipas de segurança corporativas.

## Características

- **Agregação de Feeds**: Recolhe notícias de fontes críticas de cibersegurança usando RSS feeds.
- **Inteligência Artificial**: Utiliza a Google Gemini API para sintetizar um briefing diário executivo e conciso com as notícias da última semana.
- **Auditoria Rápida**: Categorização inteligente por Ameaças, Regulamentação (NIS2, DORA, ISO) e contexto do CNCS (Centro Nacional de Cibersegurança - PT).
- **Frontend Clean**: Interface desenhada com React, simples e profissional, para leitura rápida sem distrações.

## Como Executar

### Pré-requisitos
- Node.js (v18+)
- Uma chave API da [Google Gemini API](https://aistudio.google.com/)

### Instalação

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Copie o ficheiro `.env.example` para `.env` e configure a sua chave API do Gemini:
   ```bash
   cp .env.example .env
   # Edite o ficheiro .env e adicione a sua chave: GEMINI_API_KEY=your_key_here
   ```

### Executar em Desenvolvimento

Inicie o servidor de desenvolvimento:
```bash
npm run dev
```
O servidor de backend (com Express) e o frontend estarão acessíveis em `http://localhost:3000`.

### Build para Produção

Compile a aplicação para a pasta `dist` e construa o script do servidor:
```bash
npm run build
```

Depois inicie o servidor:
```bash
npm start
```

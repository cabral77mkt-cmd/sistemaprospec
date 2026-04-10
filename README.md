# Sistema de Captacao e Prospeccao para Produtores de Eventos

Base MVP para a operacao interna da `77 Marketing`.

## Stack

- `apps/web`: Next.js 16 + React 19 + Tailwind CSS 4
- `apps/api`: NestJS 11 + Prisma + SQLite local

## O que ja existe

- login interno com JWT
- dashboard operacional com metricas do funil
- tabela de leads com filtros e movimentacao manual de pipeline
- fila de candidatos e promocao para lead
- captura manual via fixtures e URLs de paginas com telefone do produtor
- campanhas manuais de contato
- fluxo de conversa com qualificacao em etapas
- sessao de WhatsApp em modo mock com QR Code

## Subir localmente

1. Instale as dependências raiz:

```bash
npm install
```

2. Copie os exemplos de ambiente:

- `apps/api/.env.example` -> `apps/api/.env`
- `apps/web/.env.example` -> `apps/web/.env.local`

3. Gere o client do Prisma, sincronize schema e seed:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

4. Rode web + API:

```bash
npm run dev
```

## Endpoints principais

- `POST /api/auth/login`
- `GET /api/dashboard/metrics`
- `GET /api/leads`
- `GET /api/leads/candidates`
- `POST /api/capture/run`
- `POST /api/leads/:id/promote`
- `PATCH /api/leads/:id/pipeline`
- `POST /api/campaigns/start`
- `GET /api/pipeline`
- `GET /api/conversations`
- `POST /api/conversations/:id/inbound`
- `POST /api/conversations/:id/handoff`
- `POST /api/whatsapp/session/connect`
- `POST /api/whatsapp/session/mock-scan`

## Credenciais seed

- e-mail: `admin@77marketing.local`
- senha: `77marketing123`

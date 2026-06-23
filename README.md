# Cashera Capital — AI Knowledge Base

Reads bulk support emails (Gmail .mbox) and Microsoft Teams engineering channel messages, extracts reusable Q&A pairs using Claude, embeds them with OpenAI, and serves grounded answers via RAG. Will power the support agent on casheracapital.com.

## Architecture

```
Gmail .mbox upload ──→ mbox parser ──→ thread reconstructor ──→ Q&A extractor (Claude Sonnet) ──→ qa_pairs table
Teams channel sync ──→ Graph API ──→ Haiku prefilter ──────────→ same extraction pipeline        ↓
                                                                                            embed (OpenAI) → pgvector
User question ──→ embed query ──→ cosine search top-K ──→ Claude synthesizes grounded answer with citations
```

## Stack

- **LLM**: Claude Sonnet 4.6 (extraction + answering), Haiku 4.5 (Teams prefilter)
- **Embeddings**: OpenAI text-embedding-3-small (1536 dims)
- **Database**: Postgres 16 + pgvector
- **Queue**: Redis + BullMQ
- **API**: Fastify
- **Web UI**: Next.js / React
- **Teams**: User-consent OAuth (no Azure admin needed)

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres + Redis)
- Anthropic API key
- OpenAI API key

## Setup (Windows)

```powershell
# 1. Clone and install
git clone <repo> cashera-kb
cd cashera-kb
npm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Configure
cp .env.example .env
# Edit .env — fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, MS_GRAPH_CLIENT_ID, TEAMS_ENG_CHANNEL

# 4. Run (three PowerShell windows)
npm run dev:api       # API server on :3001
npm run dev:worker    # Background job processor
npm run dev:web       # Web UI on :3000

# 5. Open http://localhost:3000
# Upload a .mbox file from Google Takeout
```

## Getting your Gmail .mbox

1. Go to https://takeout.google.com
2. Deselect all, then select only **Mail**
3. Click "All Mail data included" → pick only support-relevant labels
4. Export → wait for email → download → unzip
5. Upload the .mbox file in the web UI

## Teams setup

See **TEAMS_SETUP.md** for step-by-step instructions. No Azure admin needed.

## CLI scripts

```bash
npm run process:mbox -- path/to/file.mbox    # Direct mbox processing
npm run sync:teams                            # Direct Teams sync
npm run sync:teams -- --since 2024-01-01      # Sync since date
npm run embed:backfill                        # Embed any pending pairs
npm run export:finetune                       # Export JSONL for Bedrock fine-tuning
npm run eval:run                              # Run eval harness
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/uploads/mbox | Upload .mbox file |
| POST | /api/sync/teams | Trigger Teams sync |
| GET | /api/uploads | List all uploads/syncs |
| POST | /api/ask | Query the knowledge base |
| POST | /api/feedback | Rate an answer (thumbs up/down) |
| GET | /api/qa | Browse Q&A pairs |
| POST | /api/qa/:id/deactivate | Remove a bad Q&A pair |
| GET | /api/stats | Dashboard stats |

## Cost estimates

- Q&A extraction (Sonnet, per thread): ~$0.006
- 10k email threads: ~$60 extraction + $1 embedding
- Per query (steady state): ~$0.012
- Teams prefilter (Haiku, per thread): ~$0.0005

## Integrating into casheracapital.com

When ready, your web app just needs to call the API:

```javascript
const response = await fetch('https://your-kb-host/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: userQuestion }),
});
const { answer, confidence, citations } = await response.json();
```

Add auth middleware to the Fastify server when you deploy.

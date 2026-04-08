---
title: 'Knowledge Base (RAG)'
description: 'Upload documents, auto-chunk and embed, and let agents search via retrieval-augmented generation with hybrid search and metadata filtering'
---

## Overview

CrewForm's **Knowledge Base** enables Retrieval-Augmented Generation (RAG) — upload documents, and agents automatically search relevant content when answering questions or completing tasks.

## How It Works

```
Upload Document  →  Text Extraction  →  Chunking  →  Embedding (1536-dim)
                                                            ↓
Agent Task  →  knowledge_search tool  →  Hybrid Search  →  Reranked Results
```

1. Upload documents to the Knowledge Base
2. CrewForm automatically chunks the text and generates vector embeddings
3. Enable the `knowledge_search` tool on your agents
4. During task execution, agents semantically search the knowledge base for relevant context

## Supported File Types

| Format | Extension | Description |
|---|---|---|
| Plain Text | `.txt` | Raw text files |
| Markdown | `.md` | Markdown documents |
| CSV | `.csv` | Tabular data (rows become chunks) |
| JSON | `.json` | Structured data |

## Uploading Documents

1. Navigate to **Knowledge Base** from the sidebar
2. Click **Upload Document**
3. Select your file — upload begins automatically
4. The document status progresses: `pending` → `processing` → `ready`

During processing, CrewForm:
- Extracts text content from the file
- Splits into chunks (optimized for retrieval quality)
- Generates vector embeddings using OpenAI's `text-embedding-3-small` model (1536 dimensions)
- Builds full-text search vectors (`tsvector`) for hybrid retrieval
- Stores chunks with embeddings in pgvector for fast similarity search

## Metadata Tags

Organize your documents with tags to improve retrieval precision.

### Adding Tags

1. On the Knowledge Base page, click the **tag icon** next to any document
2. Type a tag name and press Enter (e.g., `FAQ`, `Technical`, `Policy`)
3. Tags are saved immediately

### Filtering by Tags

When searching, you can filter results to only include chunks from documents with specific tags:
- In the **Retrieval Tester**, select tags from the dropdown
- Via the API, pass `tags: ["FAQ", "Technical"]` to the search endpoint
- In the `knowledge_search` agent tool, tags are passed via the agent's configuration

Tags are indexed with GIN for fast filtering even with large document collections.

## Search Modes

CrewForm supports two search modes:

### Vector Search (Default)

Standard cosine similarity search against chunk embeddings:
- **Embedding model:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **Index type:** IVFFlat (lists = 100) for fast approximate nearest-neighbor search
- **Default top-K:** 5 results
- **Scope:** Workspace-level, optionally filtered by document IDs or tags

### Hybrid Search

Combines vector similarity with PostgreSQL full-text search for better recall:

```
Final Score = (vector_weight × cosine_similarity) + (text_weight × ts_rank)
```

- **Default weights:** 70% vector / 30% full-text
- **Over-fetch strategy:** Retrieves 2× the requested results from each method, then reranks and deduplicates
- **Full-text search:** Uses PostgreSQL `tsvector` with `ts_rank_cd` for keyword matching
- **Best for:** Queries mixing semantic meaning with specific keywords, technical terms, or entity names

Toggle between search modes in the Retrieval Tester or via the API.

## Retrieval Tester

The **Retrieval Tester** is an interactive playground for evaluating search quality before deploying to agents.

### How to Use

1. Navigate to **Knowledge Base** and open the **Test Retrieval** panel
2. Type a query in the search box
3. Configure:
   - **Search Mode** — Toggle between `vector` and `hybrid`
   - **Top-K** — Number of results (1–20)
   - **Filter by Document** — Restrict to specific documents
   - **Filter by Tags** — Restrict to documents with specific tags
4. Click **Search** to see results

### Reading Results

Each result displays:
- **Similarity Score** — Color-coded bar (green = high, yellow = medium, red = low)
- **Source Document** — Which document the chunk came from
- **Chunk Preview** — The matched text content
- **Response Time** — How long the search took

Use the tester to:
- Verify that the right documents surface for expected queries
- Compare vector vs hybrid search quality
- Tune top-K and tag filters before enabling on agents

## Enabling Knowledge Search on Agents

1. Open the agent's configuration
2. In the **Tools** section, enable `knowledge_search`
3. Optionally restrict to specific documents via **Knowledge Base IDs** in the agent config
4. Save — the agent can now search your documents during task execution

### How Agents Use It

When an agent has `knowledge_search` enabled, it can call:
```
knowledge_search(query: "What is our refund policy?")
```

This returns the top-K most semantically similar chunks from your uploaded documents, which the agent uses as context for its response.

## API Endpoint

You can query the knowledge base directly without creating agent tasks:

```bash
POST /kb/search
Authorization: Bearer <supabase-jwt>

{
  "workspace_id": "your-workspace-id",
  "query": "What is our refund policy?",
  "mode": "hybrid",
  "top_k": 5,
  "tags": ["FAQ"],
  "document_ids": []
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "chunk-uuid",
      "content": "Our refund policy allows returns within 30 days...",
      "similarity": 0.89,
      "document_name": "refund-policy.md"
    }
  ],
  "mode": "hybrid",
  "response_time_ms": 42
}
```

## Managing Documents

From the Knowledge Base page you can:

- **View** — See all uploaded documents with status, file size, and chunk count
- **Tag** — Add metadata tags for filtering
- **Delete** — Remove a document and all its chunks (cascading delete)
- **Monitor** — Real-time status updates during processing
- **Test** — Use the Retrieval Tester to evaluate search quality

## Database

The Knowledge Base uses two tables:

| Table | Description |
|---|---|
| `knowledge_documents` | Uploaded file metadata (name, size, status, chunk count, tags) |
| `knowledge_chunks` | Embedded text chunks with 1536-dim vectors and tsvector for full-text search |

Both tables have workspace-scoped RLS. Two RPC functions handle search:
- `match_knowledge_chunks` — Vector-only cosine similarity search
- `hybrid_search_knowledge` — Combined vector + full-text search with reranking

## Tier Limits

| Plan | Max Documents |
|------|--------------|
| Free | 3 |
| Pro | 25 |
| Team+ | Unlimited |

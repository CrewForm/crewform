---
title: 'Knowledge Base (RAG)'
description: 'Upload documents, auto-chunk and embed, and let agents search via retrieval-augmented generation'
---

## Overview

CrewForm's **Knowledge Base** enables Retrieval-Augmented Generation (RAG) — upload documents, and agents automatically search relevant content when answering questions or completing tasks.

## How It Works

```
Upload Document  →  Text Extraction  →  Chunking  →  Embedding (1536-dim)
                                                             ↓
Agent Task  →  knowledge_search tool  →  Cosine Similarity  →  Top-K Results
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
- Stores chunks with embeddings in pgvector for fast similarity search

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

## Vector Search

CrewForm uses **pgvector** with cosine similarity for semantic search:

- **Embedding model:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **Index type:** IVFFlat (lists = 100) for fast approximate nearest-neighbor search
- **Default top-K:** 5 results
- **Scope:** Workspace-level (all documents in the workspace, or filtered by document IDs)

## Managing Documents

From the Knowledge Base page you can:

- **View** — See all uploaded documents with status, file size, and chunk count
- **Delete** — Remove a document and all its chunks (cascading delete)
- **Monitor** — Real-time status updates during processing

## Database

The Knowledge Base uses two tables:

| Table | Description |
|---|---|
| `knowledge_documents` | Uploaded file metadata (name, size, status, chunk count) |
| `knowledge_chunks` | Embedded text chunks with 1536-dim vectors |

Both tables have workspace-scoped RLS. The `match_knowledge_chunks` function performs cosine similarity search.

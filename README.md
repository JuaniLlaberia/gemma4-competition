# Gemma Assisted Facts Analyzer (GAFA)

**AI-powered claim extraction and fact-checking pipeline built on Gemma 4 and LangGraph.**

GAFA takes any text or image, extracts verifiable claims, and cross-references them against the Google Fact Check API and user-provided documents to deliver evidence-based verdicts in real time.

![Python](https://img.shields.io/badge/Python-3.14+-3776AB?logo=python&logoColor=white)
![Gemma 4](https://img.shields.io/badge/Gemma_4-E4B-4285F4?logo=google&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-Orchestration-1C3C3C?logo=langchain&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-000000?logo=ollama&logoColor=white)

---

[![GAFA Demo](https://img.youtube.com/vi/SIs-T5pzd-s/maxresdefault.jpg)](https://www.youtube.com/watch?v=SIs-T5pzd-s)

---

## How It Works

GAFA operates as a multi-stage pipeline orchestrated by LangGraph, processing claims from extraction through evidence-based analysis:

```
                          +------------------+
          Text / Image -->|    EXTRACTOR     |--> Raw claims
                          +------------------+
                                  |
                          +------------------+
                          |  NORMALIZATION   |--> Deduplicated & split claims
                          +------------------+       + search queries
                                  |
                          +------------------+
                          |  MANUAL REVIEW   |<-- User reranks, edits, removes
                          +------------------+
                                  |
                    +-------------+-------------+
                    |                           |
            [Has Internet]              [No Internet]
                    |                           |
          +---------+---------+                 |
          | QUERY GENERATION  |                 |
          | (3-5 variations)  |                 |
          +---------+---------+                 |
                    |                           |
          +---------+---------+                 |
          | GOOGLE FACT CHECK |                 |
          | (concurrent)      |                 |
          +---------+---------+                 |
                    |                           |
                    +-------------+-------------+
                                  |
                          +-------+--------+
                          |  RAG RETRIEVAL |  (if documents provided)
                          +-------+--------+
                                  |
                    +-------------+-------------+
                    |                           |
          +---------+---------+      +----------+----------+
          |   PRELIMINARY     |      |   EVIDENCE-BASED    |
          |   VERDICT         |      |   ANALYSIS          |
          | (internal knowl.) |      | (GFCA + RAG evid.)  |
          +-------------------+      +---------------------+
                    |                           |
                    +-------------+-------------+
                                  |
                          +-------+--------+
                          |  ANALYZED      |
                          |  CLAIM RESULT  |
                          +----------------+
```

Each claim goes through this pipeline individually, with results streamed to the UI in real time via Server-Sent Events.

---

## Key Features

### Multi-Modal Input

- **Text analysis** with up to 10,000 characters
- **Image text extraction** via Gemma 4 vision capabilities
- **Document upload** (PDF, DOCX, HTML, TXT, Markdown) for RAG-enhanced analysis

### Intelligent Claim Extraction

- Extracts only verifiable, factual statements (filters opinions, predictions, hypotheticals)
- Normalizes, deduplicates, and splits compound claims automatically
- Generates optimized search keywords per claim

### Interactive Claim Review

The pipeline pauses after extraction and lets you take control before analysis begins:

- **Drag-and-drop reordering** to prioritize what matters most
- **Inline editing** to refine claim text
- **Delete claims** with a 5-second undo window

### Multi-Query Evidence Retrieval

Instead of a single search, GAFA generates **3-5 diverse keyword queries** per claim (broader terms, related concepts, different angles) and searches the Google Fact Check API **concurrently** for all of them. Results are deduplicated across queries to maximize evidence coverage.

### Two-Stage Analysis

1. **Preliminary verdict** - Plausibility assessment using only the model's internal knowledge
2. **Evidence-based analysis** - Cross-references GFCA results and/or RAG documents to deliver a SUPPORT, CONTRADICT, or NO_EVIDENCE verdict with confidence scores and exact evidence excerpts

### Graceful Degradation

- **No internet?** Skips GFCA, still delivers preliminary verdicts
- **No documents?** Skips RAG, uses GFCA and/or internal knowledge
- **No API key?** Works entirely offline with model-only analysis
- **Query fails?** Other concurrent queries still return results

### Real-Time Streaming

Every step of the pipeline streams progress updates to the UI via SSE: extraction status, query generation, evidence retrieval counts, and individual claim results as they complete.

### Context-Aware Roles

Select or create custom roles (journalist, researcher, fact-checker, etc.) that shape how claims are extracted and analyzed. The role context is injected into every LLM prompt.

### Export

Download all analyzed claims as a CSV for further reporting or archiving.

---

## Tech Stack

| Layer                   | Technology                  | Purpose                                                                  |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------ |
| **LLM**                 | Gemma 4 via Ollama          | Claim extraction, normalization, query generation, analysis              |
| **Orchestration**       | LangGraph                   | Multi-graph workflow with interrupts, conditional routing, and streaming |
| **Backend**             | FastAPI + Uvicorn           | Async API with SSE streaming                                             |
| **Vector Search**       | FAISS + OllamaEmbeddings    | RAG document retrieval                                                   |
| **Document Processing** | Docling                     | PDF, DOCX, HTML parsing and chunking                                     |
| **Fact Checking**       | Google Fact Check Tools API | External evidence retrieval                                              |
| **Language Detection**  | langdetect                  | Auto-detect claim language for targeted searches                         |
| **Frontend**            | Vanilla JS + Tailwind CSS   | Lightweight, no-framework UI with drag-drop and SSE                      |

---

## Architecture

GAFA is built as **three interconnected LangGraph workflows**:

**Orchestrator** - The main graph that coordinates the full pipeline. It manages session state via a memory checkpointer, handles the interrupt mechanism for user claim review, and loops through claims one by one.

**Extractor** - A sub-graph responsible for raw claim extraction and normalization. It identifies verifiable statements, deduplicates them, splits compound claims, and generates initial search queries.

**Analyzer** - A sub-graph that processes a single claim through conditional branches: query generation, GFCA retrieval, RAG retrieval, preliminary verdict, and evidence-based analysis. Routing adapts based on internet connectivity and available evidence.

```
server/src/
  workflows/
    orquestrator/       # Main pipeline coordination
      models/           # Claim, AnalyzedClaim
    extractor/          # Claim extraction sub-graph
      models/           # ExtractorOutput, NormalizedClaim
      utils/            # Extraction & normalization prompts
    analyzer/           # Claim analysis sub-graph
      models/           # Verdicts, evidence items, search queries
      utils/            # Analysis prompts
  tools/
    gfca/               # Google Fact Check API client
    vector_db/          # FAISS vector store (singleton)
  llm/                  # Ollama wrapper (structured output)
  routes/               # FastAPI endpoints
  static/               # Frontend JS & CSS
  templates/            # Jinja2 HTML templates
```

---

## API Endpoints

| Method     | Endpoint          | Description                                                            |
| ---------- | ----------------- | ---------------------------------------------------------------------- |
| `POST`     | `/analyze/`       | Start analysis (text/image + optional docs + role). Returns SSE stream |
| `POST`     | `/analyze/resume` | Resume after claim review with reranked claims. Returns SSE stream     |
| `GET`      | `/roles`          | List available roles                                                   |
| `POST`     | `/roles`          | Create a new role                                                      |
| `DELETE`   | `/roles/{name}`   | Delete a role                                                          |
| `GET/POST` | `/config`         | Get or set GFCA API key                                                |
| `GET`      | `/health`         | Health check                                                           |

---

## Installation

### Prerequisites

- **Ollama** — required for running Gemma 4 locally. The installers will install it automatically if not already present, or you can install it manually from [ollama.com](https://ollama.com).
- **~8 GB free disk space** — for the application, Python environment, and Ollama models.
- **(Optional) NVIDIA GPU + CUDA 12.1** — only if you want GPU acceleration. CPU mode works on any machine.

### Windows

1. Download `GAFA-Setup.exe` from the [latest release](https://github.com/JuaniLlaberia/gemma4-competition/releases/latest)
2. Run the installer — it will walk you through:
   - Choosing an install directory
   - Selecting **CPU** or **GPU (CUDA 12.1)** variant
   - Setting the LLM model name (default: `gemma4:e4b`)
   - Picking a save directory for your data
3. The installer automatically handles Python 3.12, dependencies, Ollama, and model downloads
4. Launch GAFA from the Start Menu or Desktop shortcut

### Linux

1. Download `gafa-linux.tar.gz` from the [latest release](https://github.com/JuaniLlaberia/gemma4-competition/releases/latest)
2. Extract and run the installer:
   ```bash
   tar -xzf gafa-linux.tar.gz
   bash gafa/install-linux.sh
   ```
3. The interactive installer will prompt you for:
   - Install directory (default: `~/gafa`)
   - **CPU** or **GPU (CUDA 12.1)** variant
   - LLM model name (default: `gemma4:e4b`)
   - Save files directory (default: `<install-dir>/data`)
4. Launch GAFA from your application menu, desktop shortcut, or terminal:
   ```bash
   ~/gafa/gafa.sh
   ```

### What the installer does

Both installers automate the full setup process:

1. Install [uv](https://github.com/astral-sh/uv) (fast Python package manager)
2. Install a portable Python 3.12
3. Create a virtual environment and install all dependencies
4. Install Ollama (if not already installed)
5. Pull the LLM model (`gemma4:e4b`) and embedding model (`embeddinggemma`)
6. Pre-download Docling layout/OCR models for faster first run
7. Write the `.env` configuration file

### Uninstalling

- **Windows:** Use the standard Windows uninstaller (Settings > Apps)
- **Linux:** Run `bash <install-dir>/uninstall.sh`

Both uninstallers offer to remove downloaded Ollama models and Ollama itself.

---

## Team

Built for the Gemma 4 Hackathon by:

| Name                 | GitHub                                                                                                                 | LinkedIn                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Juan I. Llaberia** | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white)](https://github.com/JuaniLlaberia) | [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/juan-ignacio-llaberia-241b351b3/) |
| **Mark Mysler**      | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white)](https://github.com/markmysler)    | [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/mark-mysler/)                     |

---

## License

This project was built as part of a hackathon and is provided as-is.

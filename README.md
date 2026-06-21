# ATT Workspace UI (ATT-UI)

A visual workspace application for the **AI-Team-Team (ATT)** multi-agent framework. It enables ordinary users to run tasks with ATT, upload and edit files in real-time document libraries, and watch the spawned AI teams collaborate and operate on files.

> [!CAUTION]
> This project is entirely written by Gemini. It is only intended to test ATT and validate my ideas regarding ATT-UI.

> [!IMPORTANT]
> This project is not a particularly user-friendly UI. If you are interested and have the time, your contributions to this project would be greatly appreciated. Thank you very much!

## Features

1. **Interactive Workspace Chat**: Start projects and communicate directly with the ATT Root AI and its sub-agent teams. Differentiates user messages from agent final answers and collapses raw thoughts/tool actions into collapsible accordions.
2. **File Explorer**: Browse file structures within team libraries, upload files, download results, and view/edit code or text in a simple built-in code editor.
3. **Real-time Task Progress**: Renders the active hierarchical agent team lineage in an SVG-based node tree, listing active agent roles and completed milestones in real-time.
4. **Human-in-the-Loop Decisions**: Prompt overlays for voting proposals (adding/removing members) and file confirmations, letting users decide active team proposals.

## Prerequisites

- Node.js (v20+)
- Python 3.13

## Project Setup & Running

First, make sure both backend and frontend environments are installed.

### 1. Run the Backend (FastAPI)

From the root directory:

```bash
npm run backend
```

Or manually:

```bash
cd backend
source venv/bin/activate
python app.py
```

The backend server runs on `http://127.0.0.1:8000`.

### 2. Run the Frontend (React + Vite)

In a separate terminal, from the root directory:

```bash
npm run frontend
```

Or manually:

```bash
cd frontend
npm run dev
```

The frontend dev server runs on `http://127.0.0.1:5173`. Open this URL in your web browser.

## Architecture & Communication

- **API Proxy**: Frontend Vite configuration proxies all `/api` REST requests and `/ws` WebSocket requests to the FastAPI backend (`http://localhost:8000`).
- **WebSockets Broadcaster**: The backend runner intercepts ATT manager event callbacks (`on_status_change`, `on_log_append`, `on_activity_added`, etc.) and broadcasts them to the active project WebSocket channel.
- **SQLite Synchronization**: Whenever a WebSocket event is received by the frontend (indicating a database change), it automatically pulls the latest state snapshot from SQLite via `/api/projects/{name}/state`, ensuring 100% data consistency.
- **Simulation Mode**: By default, the backend includes a rule-based simulation engine (`simulate_generator_handler`) that acts as the model generator. It simulates agents thinking, calling file tools, and requesting migrations, enabling full workspace interaction without requiring external LLM API credentials.

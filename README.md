# Investment Memory

> **Remember why you invested.**

Investment Memory is a personal investment decision journal built to help preserve the **reasoning behind an investment**, not to tell someone what to buy or sell.

The project was built for my dad, who wanted a simple way to record what he invested in, why he invested, what his original plan was, and when he wanted to review that decision later.

It supports both **text and voice input**, uses open-source AI to structure natural-language notes, and keeps the user in control through an editable confirmation step.

---

## Live Demo

**https://investment-memory-frontend.onrender.com**

The public demo uses fictional/demo investment records.

---

## Why I Built This

Over time, it is easy to remember **what** you invested in while forgetting **why** you made the decision.

Investment Memory is designed to preserve that context.

Instead of generating investment advice, predictions, or buy/sell recommendations, it helps the user record:

- What they invested in
- How much they invested
- Purchase price
- Why they invested
- Their stated intent
- Time horizon
- Review price
- Review date
- Later review notes

The goal is simple:

**Remember the decision. Remember the reasoning. Revisit it later.**

---

## Features

### Voice Capture

Record an investment note directly through the browser.

The audio can be transcribed using Whisper and the transcript is shown to the user before anything is saved.

### Text Capture

Investment decisions can also be entered directly as natural-language text.

### AI Extraction

Gemma extracts structured investment information from the user's note.

The extraction prompt is designed to:

- Use only information explicitly stated by the user
- Leave missing information blank
- Avoid inventing details
- Avoid generating financial advice
- Treat a review price as a review point rather than a buy/sell instruction

### Human-in-the-Loop Confirmation

AI output is never silently saved.

The user can review and correct every extracted field before confirming the record.

### Search

Search saved investment memories by:

- Stock name
- Reason
- Intent
- Original note

### Review Reminders

Investment records can have a user-defined review date.

The dashboard shows:

- Due today
- Overdue

### Mark as Reviewed

A user can record what they noticed during a review and optionally set the next review date.

### Review History

Reviews are stored separately so multiple reviews can be preserved over time instead of overwriting previous notes.

### Edit Saved Records

Saved investment information can be corrected later without creating a duplicate record.

### Light / Dark Mode

The interface supports both light and dark themes, with the selected theme persisted in the browser.

---

## Architecture

### Local-first version

The original version is designed to run locally:

```text
Voice / Text
      |
      v
Whisper
      |
      v
Gemma 3 4B
      |
      v
Human Review
      |
      v
FastAPI
      |
      v
SQLite

Local AI components:

Ollama
Gemma 3 4B
faster-whisper
Public deployment

For the public demo, hosted inference is used:

Browser
   |
   v
React / Vite
   |
   v
FastAPI
   |
   +----------------------+
   |                      |
   v                      v
Hugging Face          Neon PostgreSQL
Gemma + Whisper
   |
   v
Structured result

The deployed frontend and backend are hosted on Render.

The public version uses Neon PostgreSQL for persistent storage and Hugging Face inference for the hosted AI path.

Tech Stack
Frontend
React
Vite
JavaScript
CSS
Backend
Python
FastAPI
SQLAlchemy
Pydantic
AI
Gemma 3 4B
Ollama for local inference
Whisper / faster-whisper for local speech recognition
Hugging Face inference for the hosted version
Database
SQLite for local use
PostgreSQL with Neon for the public deployment
Deployment
Render
Neon
Hugging Face
Project Structure
Investment-Memory/
│
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   └── investment_memory.db
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── ...
│   ├── package.json
│   └── ...
│
├── .python-version
└── README.md

investment_memory.db is the local SQLite database and should not be committed if it contains personal data.

Local Setup
Requirements

Make sure you have:

Python 3.12
Node.js
npm
Ollama
Gemma 3 4B

Python 3.12.10 is the version used during development and deployment.

1. Clone the repository
git clone https://github.com/Bhavya4523/Investment-Memory.git
cd Investment-Memory
2. Set up the backend

Open a terminal:

cd backend

Create a virtual environment:

Windows
python -m venv .venv
.\.venv\Scripts\Activate.ps1

Install the dependencies:

pip install -r requirements.txt
3. Install and run Gemma locally

Make sure Ollama is installed and running.

Pull the model:

ollama pull gemma3:4b

The application uses:

gemma3:4b

for local extraction.

4. Start the FastAPI backend

From the backend directory:

uvicorn main:app --reload

The backend will run at:

http://localhost:8000

Health check:

http://localhost:8000/health

Expected response:

{
  "status": "healthy"
}
5. Start the frontend

Open another terminal:

cd frontend
npm install
npm run dev

The frontend will normally run at:

http://localhost:5173
Local AI Configuration

By default, the application runs in local mode.

AI_MODE=local

The local setup uses:

Gemma 3 4B → Ollama
Whisper → faster-whisper
Database → SQLite

The backend automatically falls back to SQLite when DATABASE_URL is not provided.

Hosted Deployment Configuration

The deployed version uses environment variables.

Backend

The following environment variables are used:

PYTHON_VERSION=3.12.10

AI_MODE=hosted

HF_TOKEN=<your Hugging Face token>

HF_TEXT_MODEL=google/gemma-3-4b-it

HF_ASR_MODEL=openai/whisper-large-v3

DATABASE_URL=<your Neon PostgreSQL connection string>

CORS_ORIGINS=https://investment-memory-frontend.onrender.com

Never commit secrets such as HF_TOKEN or DATABASE_URL to GitHub.

Frontend

The frontend uses:

VITE_API_URL=https://investment-memory.onrender.com

This allows the same React application to use:

Local:
http://localhost:8000

or:

Hosted:
https://investment-memory.onrender.com
API Endpoints
Health
GET /health

Returns the backend health status.

AI Extraction
POST /extract-investment

Accepts a natural-language investment note and returns structured investment details.

Save Investment
POST /investments

Stores a confirmed investment record.

Get Investments
GET /investments

Returns saved investment records.

Search
GET /search?q=<query>

Searches investment memories.

Voice Transcription
POST /transcribe

Transcribes an uploaded audio recording.

Record Review
POST /investments/{investment_id}/reviews

Stores a review and optionally updates the next review date.

Review History
GET /investments/{investment_id}/reviews

Returns the review history for an investment.

Update Investment
PUT /investments/{investment_id}

Updates an existing investment record.

Data Model
Investment

An investment record contains information such as:

id
stock
quantity
buy_price
reason
intent
time_horizon
review_price
review_date
original_note
created_at
Review

Each investment can have multiple review records:

id
investment_id
review_note
reviewed_at
next_review_date

This allows the application to preserve the history of how the user revisited their original decision.

Human-in-the-Loop Design

One of the core design principles of Investment Memory is:

Capture
   ↓
AI extraction
   ↓
Human review
   ↓
Human correction
   ↓
Confirm & save

The AI organizes the user's note.

The user remains the source of truth.

Privacy and Data Handling

The project has two deployment modes.

Local mode

The local version can run:

Gemma locally
Whisper locally
SQLite locally

This allows personal records to remain on the local machine.

Public demo

The public demo uses:

Hosted inference
Neon PostgreSQL
Render

The public demo therefore should not be used for private family financial records.

What This Project Does Not Do

Investment Memory is a record-keeping application.

It does not:

Recommend stocks
Tell users when to buy or sell
Predict stock prices
Provide financial advice
Automatically make investment decisions

The application is designed to preserve the user's own reasoning.

Deployment

The project is currently deployed using:

Frontend → Render Static Site
Backend  → Render Web Service
Database → Neon PostgreSQL
AI       → Hugging Face inference
Public URLs

Frontend:

https://investment-memory-frontend.onrender.com

Backend:

https://investment-memory.onrender.com

Backend health endpoint:

https://investment-memory.onrender.com/health
Development Notes

During deployment, the first backend build exceeded the available memory limit because the local faster-whisper stack was being loaded even though the hosted deployment used Hugging Face for speech recognition.

The solution was to load faster-whisper only when running in local mode:

if AI_MODE == "local":
    from faster_whisper import WhisperModel

This avoided loading unnecessary local inference dependencies in the hosted environment.

This also keeps the architecture flexible:

Local Mode
→ Ollama
→ faster-whisper
→ SQLite
Hosted Mode
→ Hugging Face
→ Neon PostgreSQL
Hacktoberfest Weekend Challenge

This project was built for the:

Hacktoberfest Weekend Challenge: Build for a Friend

The project focuses on building something for a real person and using open-source AI at its core.

Relevant technologies include:

Gemma
Whisper
Hugging Face
Render
Neon

Challenge hashtag:

#hf26challenge
Future Possibilities

The current project intentionally stays focused on personal investment memory.

Possible future extensions could include:

Better review summaries
More flexible export formats
Importing existing journal records
Additional local AI models
More advanced personal search

These are intentionally outside the current core scope.

Author

Bhavya Gothi

GitHub:

https://github.com/Bhavya4523



### One important thing before you paste it

Your GitHub currently contains the project, but **don't commit `investment_memory.db` if it contains your actual/family records**. Also make sure any `.env` file and secrets are ignored.

Your `.gitignore` should at minimum cover:

```gitignore
# Python
.venv/
__pycache__/
*.pyc

# Environment / secrets
.env
.env.*

# Local database
backend/investment_memory.db

# Node
frontend/node_modules/
frontend/dist/

# OS / editor
.DS_Store
.vscode/

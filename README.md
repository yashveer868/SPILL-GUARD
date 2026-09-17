# SpillGuard Backend

This project now includes a lightweight FastAPI backend for vessel matching, suspect ranking, and drift analysis.

## Prerequisites

- Python 3.10+
- pip

## Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run the backend

```bash
uvicorn server.api:app --reload --host 127.0.0.1 --port 8000
```

Then open:

```text
http://127.0.0.1:8000
```

## Available endpoints

- `POST /api/match-vessels`
- `POST /api/rank-suspects`
- `POST /api/drift`
- `GET /api/health`
- `GET /api/bootstrap`

## Notes

All outputs are intended as investigation support, not final proof.

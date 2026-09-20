# Spill Sense Backend

Spill Sense now includes an Express + Prisma MVP backend for incident, vessel, AIS-position, alert-event, and evidence-integrity tracking. The existing Python service remains available for the optional ML/drift prototype endpoints.

## Prerequisites

- Python 3.10+
- pip
- Node.js 20+
- PostgreSQL 14+

## Install dependencies

```bash
npm install
copy .env.example .env  # Windows
```

Set `DATABASE_URL` in `.env`; do not commit `.env`.

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/spillsense"
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

Run the Express API:

```bash
npm run dev
```

The API listens on `http://localhost:3000`. The static frontend remains available through a static server such as:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.

Useful Node commands:

- `npm run dev` — local API with Node watch mode
- `npm start` — production-style API process
- `npm test` — API contract tests
- `npm run seed` — reset and insert clearly marked DEMO records

## Legacy Python / ML service

The optional Python service remains available for the current ML and drift prototype:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Set the PostgreSQL connection string before starting the API. PowerShell example:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/spillguard"
```

## Real emergency delivery

The emergency buttons use demo mode by default. For production delivery, set
`EMERGENCY_ALERT_MODE=production` and configure Twilio for SMS plus an HTTPS
authority gateway. Keep these values in Vercel Environment Variables; never
commit them.

```powershell
$env:EMERGENCY_ALERT_MODE = "production"
$env:TWILIO_ACCOUNT_SID = "AC..."
$env:TWILIO_AUTH_TOKEN = "..."
$env:TWILIO_FROM_NUMBER = "+15551234567"
$env:EMERGENCY_SMS_TO = "+15557654321"
$env:EMERGENCY_OFFICIAL_WEBHOOK_URL = "https://authority.example.gov/spill-alerts"
```

`SEND VIA SMS` sends through Twilio. `SEND OFFICIAL ALERT` posts the complete
alert payload to `EMERGENCY_OFFICIAL_WEBHOOK_URL`.

Create the `spillguard` database first. The API creates its tables and seeds the initial dashboard data on startup.

## Run the legacy Python backend

```bash
uvicorn server.api:app --reload --host 127.0.0.1 --port 8000
```

Then open:

```text
http://127.0.0.1:8000
```

## Express MVP endpoints

- `GET /api/health`
- `GET /api/incidents`, `GET /api/incidents/:id`
- `POST /api/incidents`, `PATCH /api/incidents/:id`
- `GET /api/incidents/:id/timeline`
- `POST /api/incidents/:id/evidence` — SHA-256 integrity tracking, not legal admissibility
- `GET /api/vessels`, `GET /api/vessels/:id`, `POST /api/vessels`
- `POST /api/vessels/:id/positions`
- `GET /api/dashboard/summary`

## Legacy Python endpoints

- `POST /api/match-vessels`
- `POST /api/rank-suspects`
- `POST /api/drift`
- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/detect/model` — ML stack status (torch/sklearn/checkpoint)
- `GET /api/detect/demo?lat=2.3812&lon=101.9124&resolution_m=10&patch_size=256` — run the UNet + DBSCAN detection pipeline

## ML Detection Pipeline (UNet + DBSCAN)

The dashboard's **"Run ML Detection"** button runs a two-stage pipeline on SAR imagery:

1. **UNet segmentation** — a fully trainable U-Net classifies each pixel as oil / open water.
2. **DBSCAN clustering** — oil pixels are clustered into distinct spill objects, noise is discarded, and each cluster is emitted as a GeoJSON polygon rendered on the Leaflet map.

### Demo mode (works immediately, zero heavy deps)

Without PyTorch or a trained checkpoint the API **synthesises a SAR-style scene**, simulates the segmentation mask, and still runs the **real DBSCAN** clustering + polygon extraction — so the whole flow works end-to-end as soon as you start the server.

### Train the real model (from scratch)

```bash
# heavy deps (~2GB)
pip install -r requirements-ml.txt

# Option A: train on auto-generated synthetic scenes
python server/train_unet.py --synthetic --samples 600 --epochs 30

# Option B: train on your own labeled SAR pairs (images/ + masks/)
python server/train_unet.py --data path/to/dataset --epochs 40
```

The checkpoint is written to `server/checkpoints/unet_oil_spill.pth`. As soon as it exists, the API automatically switches from demo segmentation to **real UNet inference** on the generated SAR scan.

### How it fits together

```
SAR patch (server/ml_detector.py synthesizes one in demo mode)
      │
      ▼
UNet ──► binary oil mask (pure-python fallback when torch absent)
      │
      ▼
DBSCAN ──► clusters  (scikit-learn; 4-connectivity fallback if missing)
      │
      ▼
convex-hull ──► GeoJSON polygons ──► Leaflet "ML Detections" layer
```

## Notes

All outputs are intended as investigation support, not final proof.
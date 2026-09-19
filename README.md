# SpillGuard Backend

This project now includes a lightweight FastAPI backend for vessel matching, suspect ranking, and drift analysis.

## Prerequisites

- Python 3.10+
- pip
- PostgreSQL 14+

## Install dependencies

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
- `GET /api/detect/model` — ML stack status (torch/sklearn/checkpoint)
- `GET /api/detect/demo?lat=2.3812&lon=101.9124&resolution_m=10&patch_size=256` — run the UNet + DBSCAN detection pipeline

## ML Detection Pipeline (UNet + DBSCAN)

The dashboard's **"Run ML Detection"** button exercises a two-stage prototype pipeline on SAR-style imagery:

1. **U-Net segmentation** — the architecture can classify pixels when a trained checkpoint is installed.
2. **DBSCAN clustering** — segmented pixels are clustered into candidate anomaly objects and emitted as GeoJSON polygons.

### Demo mode (works immediately, zero heavy deps)

Without PyTorch or a trained checkpoint the API **synthesises a SAR-style scene** and perturbs its synthetic reference mask. This is a demonstration path, not model evaluation or measured accuracy. DBSCAN clustering and polygon extraction can still exercise the downstream geometry workflow.

### Train the real model (from scratch)

```bash
# heavy deps (~2GB)
pip install -r requirements-ml.txt

# Option A: train on auto-generated synthetic scenes
python server/train_unet.py --synthetic --samples 600 --epochs 30

# Option B: train on your own labeled SAR pairs (images/ + masks/)
python server/train_unet.py --data path/to/dataset --epochs 40
```

The checkpoint is written to `server/checkpoints/unet_oil_spill.pth`. As soon as it exists, the API can switch from demo segmentation to U-Net inference on the generated SAR-style scan. No real SAR dataset or held-out evaluation benchmark is included in this repository.

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
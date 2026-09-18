"""SpillGuard HTTP API and static-site server."""

import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

try:
    from server.database import (
        add_vessel_note,
        get_vessel_notes,
        init_db,
        query_analytics,
        query_investigation,
        query_spill_by_id,
        query_spills,
        query_vessels,
    )
    from server.models import (
        DriftRequest,
        MatchVesselsRequest,
        RankSuspectsRequest,
        VesselNoteCreate,
        SarAisCorrelateRequest,
    )
except ImportError:  # pragma: no cover - fallback for direct script execution
    from database import (
        add_vessel_note,
        get_vessel_notes,
        init_db,
        query_analytics,
        query_investigation,
        query_spill_by_id,
        query_spills,
        query_vessels,
    )
    from models import (
        DriftRequest,
        MatchVesselsRequest,
        RankSuspectsRequest,
        VesselNoteCreate,
    )

ROOT_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(title="SpillGuard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError as exc:  # pragma: no cover - validation path
        raise HTTPException(status_code=400, detail=f"Invalid ISO datetime: {value}") from exc


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    delta_lat = lat2_rad - lat1_rad
    delta_lon = lon2_rad - lon1_rad

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


def lat_lon_from_bearing(lat: float, lon: float, distance_km: float, bearing_deg: float) -> Dict[str, float]:
    radius_km = 6371.0
    bearing = math.radians(bearing_deg)
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)

    angular_distance = distance_km / radius_km
    new_lat = math.asin(
        math.sin(lat_rad) * math.cos(angular_distance)
        + math.cos(lat_rad) * math.sin(angular_distance) * math.cos(bearing)
    )
    new_lon = lon_rad + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat_rad),
        math.cos(angular_distance) - math.sin(lat_rad) * math.sin(new_lat),
    )
    return {
        "lat": math.degrees(new_lat),
        "lon": (math.degrees(new_lon) + 540) % 360 - 180,
    }


def dead_reckon_position(lat: float, lon: float, heading_deg: float, speed_knots: float, time_seconds: float) -> Dict[str, float]:
    """Estimate position after time_seconds using heading and speed (knots).
    If time_seconds is negative, this reverses the movement (backwards)."""
    # convert speed knots to km/s
    if speed_knots is None:
        return {"lat": lat, "lon": lon}
    speed_mps = speed_knots * 0.514444
    distance_km = (abs(time_seconds) * speed_mps) / 1000.0
    bearing = heading_deg if time_seconds >= 0 else (heading_deg + 180.0) % 360.0
    return lat_lon_from_bearing(lat, lon, distance_km, bearing)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/bootstrap")
def bootstrap() -> dict:
    """Return all dashboard data required for the initial page load."""
    return {
        "spills": query_spills(),
        "vessels": query_vessels(),
        "investigation": query_investigation("SG-8842"),
        "analytics": query_analytics(),
    }


@app.get("/api/spills")
def spills(severity: Optional[str] = Query(default=None)) -> list[dict]:
    return query_spills(severity)


@app.get("/api/spills/{spill_id}")
def spill(spill_id: str) -> dict:
    result = query_spill_by_id(spill_id)
    if not result:
        raise HTTPException(status_code=404, detail="Spill not found")
    return result


@app.get("/api/vessels")
def vessels(filter_type: Optional[str] = None, search: Optional[str] = None) -> list[dict]:
    return query_vessels(filter_type, search)


@app.get("/api/vessels/{imo}/notes")
def vessel_notes(imo: int) -> list[dict]:
    return get_vessel_notes(imo)


@app.post("/api/vessels/{imo}/notes", status_code=201)
def create_vessel_note(imo: int, payload: VesselNoteCreate) -> dict:
    return add_vessel_note(imo, payload.note, payload.author or "Command Analyst")


@app.get("/api/investigations/{incident_id}")
def investigation(incident_id: str) -> dict:
    result = query_investigation(incident_id)
    if not result:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return result


@app.get("/api/analytics")
def analytics() -> dict:
    return query_analytics()


@app.post("/api/match-vessels")
def match_vessels(payload: MatchVesselsRequest) -> dict:
    """Match each SAR vessel to the nearest AIS vessel within 5km and 15 minutes."""
    sar_time = parse_iso_datetime(payload.sar_time)
    if sar_time is None:
        raise HTTPException(status_code=400, detail="sar_time is required")

    results: List[Dict[str, Any]] = []
    for sar_vessel in payload.sar_vessels:
        best_match = None
        best_distance = float("inf")
        best_time_delta = float("inf")

        for ais in payload.ais_points:
            ais_time = parse_iso_datetime(ais.timestamp)
            if ais_time is None:
                continue

            distance_km = haversine_distance_km(sar_vessel.lat, sar_vessel.lon, ais.lat, ais.lon)
            time_delta_minutes = abs((sar_time - ais_time).total_seconds() / 60.0)

            if distance_km <= 5.0 and time_delta_minutes <= 15.0:
                score = distance_km + (time_delta_minutes * 0.5)
                if score < best_distance + (best_time_delta * 0.5) or best_match is None:
                    best_match = ais
                    best_distance = distance_km
                    best_time_delta = time_delta_minutes

        if best_match is None:
            results.append(
                {
                    "sar_vessel_id": sar_vessel.id,
                    "status": "possible_dark_vessel",
                    "matched_ais_vessel": None,
                    "distance_km": None,
                    "time_difference_minutes": None,
                    "match_confidence": 0.0,
                }
            )
            continue

        confidence = max(0.0, min(100.0, 100.0 - (best_distance * 8.5 + best_time_delta * 1.8)))
        results.append(
            {
                "sar_vessel_id": sar_vessel.id,
                "status": "matched",
                "matched_ais_vessel": {
                    "mmsi": best_match.mmsi,
                    "vessel_name": best_match.vessel_name,
                    "vessel_type": best_match.vessel_type,
                    "distance_km": round(best_distance, 3),
                    "time_difference_minutes": round(best_time_delta, 2),
                },
                "distance_km": round(best_distance, 3),
                "time_difference_minutes": round(best_time_delta, 2),
                "match_confidence": round(confidence, 2),
            }
        )

    return {
        "results": results,
        "warning": "Investigation support, not final proof.",
    }


@app.post("/api/sar-ais/correlate")
def sar_ais_correlate(payload: SarAisCorrelateRequest) -> dict:
    """Correlate a single SAR target to AIS records.

    Scoring weights:
      - distance: 60%
      - time quality: 20%
      - heading difference: 10%
      - length similarity: 10%
    """
    sar_time = parse_iso_datetime(payload.sar_time)
    if sar_time is None:
        raise HTTPException(status_code=400, detail="sar_time is required")

    results: List[Dict[str, Any]] = []
    match_found = False

    for rec in payload.ais_records:
        # parse ais timestamp
        try:
            ais_time = parse_iso_datetime(rec.timestamp)
        except Exception:
            ais_time = None

        time_diff_minutes = None
        time_seconds = None
        if ais_time is not None:
            time_seconds = (sar_time - ais_time).total_seconds()
            time_diff_minutes = abs(time_seconds) / 60.0

        # only consider within ±30 minutes
        if time_diff_minutes is None or time_diff_minutes > 30.0:
            continue

        # dead-reckon/interpolate to SAR time
        pred = None
        if rec.heading is not None and rec.speed_knots is not None:
            pred = dead_reckon_position(rec.lat, rec.lon, rec.heading, rec.speed_knots, time_seconds)
        else:
            pred = {"lat": rec.lat, "lon": rec.lon}

        distance_km = haversine_distance_km(payload.sar_lat, payload.sar_lon, pred["lat"], pred["lon"])

        # component scores
        # distance score: linear from 0..20km -> 100..0
        dist_norm = max(0.0, min(1.0, 1.0 - (distance_km / 20.0)))
        distance_score = dist_norm * 100.0

        # time quality: 0..30min -> 100..0
        time_quality = max(0.0, min(1.0, 1.0 - (time_diff_minutes / 30.0))) * 100.0 if time_diff_minutes is not None else 0.0

        # heading diff: if SAR heading provided, compute angle diff between SAR heading and AIS heading
        heading_score = 50.0
        if payload.sar_heading is not None and rec.heading is not None:
            diff = abs(((payload.sar_heading - rec.heading + 180.0) % 360.0) - 180.0)
            heading_score = max(0.0, 100.0 * (1.0 - diff / 180.0))
        else:
            # partial credit if missing
            heading_score = 50.0

        # length similarity: if both present
        length_score = 50.0
        if payload.sar_length_m is not None and rec.length_m is not None and rec.length_m > 0:
            diff_len = abs((payload.sar_length_m or 0.0) - rec.length_m)
            denom = max(rec.length_m, payload.sar_length_m or 1.0)
            length_score = max(0.0, 100.0 * (1.0 - (diff_len / denom)))

        # weighted total
        total = (
            distance_score * 0.60
            + time_quality * 0.20
            + heading_score * 0.10
            + length_score * 0.10
        )

        reasons: List[str] = []
        reasons.append(f"distance_km={distance_km:.3f}")
        reasons.append(f"time_diff_min={time_diff_minutes:.2f}")
        reasons.append(f"distance_score={distance_score:.1f}")
        reasons.append(f"time_quality={time_quality:.1f}")

        match = (distance_km <= 3.0 and total >= 70.0)
        if match:
            match_found = True

        results.append(
            {
                "mmsi": rec.mmsi,
                "vessel_name": rec.vessel_name,
                "predicted_lat": round(pred["lat"], 6),
                "predicted_lon": round(pred["lon"], 6),
                "distance_km": round(distance_km, 3),
                "time_difference_minutes": round(time_diff_minutes, 2) if time_diff_minutes is not None else None,
                "score": round(total, 2),
                "matched": match,
                "reasons": reasons,
            }
        )

    if not results:
        return {
            "results": [],
            "message": "No AIS records within ±30 minutes of SAR acquisition. Possible AIS-dark vessel.",
            "warning": "Investigation support, not final proof.",
        }

    # sort by score desc
    results.sort(key=lambda x: x["score"], reverse=True)

    top = results[0]
    status = "matched" if top["matched"] else "no_match"

    return {
        "sar_target": {"lat": payload.sar_lat, "lon": payload.sar_lon, "time": payload.sar_time},
        "status": status,
        "best_match": top,
        "results": results,
        "warning": "Investigation support, not final proof.",
    }


@app.post("/api/rank-suspects")
def rank_suspects(payload: RankSuspectsRequest) -> dict:
    """Rank vessels by proximity, timing, AIS gap, speed anomaly, and type."""
    release_start = parse_iso_datetime(payload.release_start)
    release_end = parse_iso_datetime(payload.release_end)
    if release_start is None or release_end is None:
        raise HTTPException(status_code=400, detail="release_start and release_end are required")

    ranked: List[Dict[str, Any]] = []
    for vessel in payload.vessels:
        lat = vessel.lat if vessel.lat is not None else vessel.latitude
        lon = vessel.lon if vessel.lon is not None else vessel.longitude
        if lat is None or lon is None:
            proximity_score = 0.0
            distance_km = None
        else:
            distance_km = haversine_distance_km(payload.origin_lat, payload.origin_lon, lat, lon)
            proximity_score = max(0.0, min(35.0, 35.0 * (1.0 - min(distance_km, 50.0) / 50.0)))

        raw_speed = vessel.speed_knots if vessel.speed_knots is not None else vessel.speed
        if raw_speed is None:
            speed_score = 0.0
        else:
            speed_delta = abs(raw_speed - 12.0)
            if speed_delta >= 6.0:
                speed_score = 15.0
            elif speed_delta >= 3.5:
                speed_score = 10.0
            elif speed_delta >= 1.5:
                speed_score = 5.0
            else:
                speed_score = 0.0

        vessel_type_value = vessel.vessel_type or vessel.type or ""
        vessel_type_text = vessel_type_value.lower()
        type_score = 10.0 if any(token in vessel_type_text for token in ("tanker", "cargo", "bulk", "container", "chemical", "carrier")) else 0.0

        gap_minutes = None
        if vessel.ais_gap_minutes is not None:
            gap_minutes = vessel.ais_gap_minutes
        elif vessel.ais_gap is not None:
            gap_minutes = vessel.ais_gap

        if gap_minutes is None:
            ais_gap_score = 0.0
        else:
            ais_gap_score = min(15.0, (max(0.0, gap_minutes) / 180.0) * 15.0)

        timestamp_value = vessel.timestamp or vessel.last_seen
        vessel_present = False
        if timestamp_value:
            vessel_time = parse_iso_datetime(timestamp_value)
            if vessel_time is not None:
                vessel_present = release_start <= vessel_time <= release_end
        present_score = 25.0 if vessel_present else 0.0

        reasons: List[str] = []
        if distance_km is not None:
            if distance_km <= 5.0:
                reasons.append(f"Vessel was within {distance_km:.1f} km of the origin")
            elif distance_km <= 20.0:
                reasons.append(f"Vessel was near the origin at {distance_km:.1f} km")
        if vessel_present:
            reasons.append("Present during the release window")
        if gap_minutes is not None and gap_minutes > 30:
            reasons.append(f"AIS blackout of {gap_minutes:.0f} minutes")
        if speed_score >= 10.0:
            reasons.append(f"Speed anomaly detected ({raw_speed:.1f} knots)")
        if type_score > 0.0:
            reasons.append(f"{vessel_type_value} category increases risk")

        total_score = round(
            proximity_score + present_score + ais_gap_score + speed_score + type_score,
            2,
        )
        if total_score >= 70:
            priority = "High"
        elif total_score >= 40:
            priority = "Medium"
        else:
            priority = "Low"

        ranked.append(
            {
                "vessel_name": vessel.vessel_name or vessel.name or "Unknown vessel",
                "vessel_type": vessel_type_value or "Unknown",
                "total_score": total_score,
                "priority": priority,
                "proximity_score": round(proximity_score, 2),
                "release_window_score": round(present_score, 2),
                "ais_gap_score": round(ais_gap_score, 2),
                "speed_anomaly_score": round(speed_score, 2),
                "vessel_type_score": round(type_score, 2),
                "reasons": reasons if reasons else ["Insufficient anomaly signal for this vessel."],
                "distance_km": round(distance_km, 2) if distance_km is not None else None,
            }
        )

    ranked.sort(key=lambda item: item["total_score"], reverse=True)
    return {
        "results": ranked,
        "warning": "Investigation support, not final proof.",
    }


@app.post("/api/drift")
def drift(payload: DriftRequest) -> dict:
    """Estimate forward and backward drift using a simplified current-only model."""
    if payload.hours <= 0:
        raise HTTPException(status_code=400, detail="hours must be greater than zero")

    distance_m = payload.current_speed_mps * payload.hours * 3600.0
    forward = lat_lon_from_bearing(
        payload.spill_lat,
        payload.spill_lon,
        distance_m / 1000.0,
        payload.current_direction_degrees,
    )
    backward = lat_lon_from_bearing(
        payload.spill_lat,
        payload.spill_lon,
        distance_m / 1000.0,
        (payload.current_direction_degrees + 180.0) % 360.0,
    )

    return {
        "forward_location": {
            "lat": round(forward["lat"], 6),
            "lon": round(forward["lon"], 6),
        },
        "backward_source_location": {
            "lat": round(backward["lat"], 6),
            "lon": round(backward["lon"], 6),
        },
        "geojson": {
            "type": "Feature",
            "properties": {
                "warning": "This is a simplified prototype estimate for investigation support only.",
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [payload.spill_lon, payload.spill_lat],
                    [backward["lon"], backward["lat"]],
                    [forward["lon"], forward["lat"]],
                ],
            },
        },
        "warning": "Investigation support, not final proof. This is a simplified prototype estimate.",
    }


REGION_DATASETS: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "malacca": {
        "spills": [
            {
                "id": "SG-8842",
                "title": "Malacca Strait TSS Central Infiltration",
                "severity": "critical",
                "status": "UNATTRIBUTED DISCHARGE",
                "coords": [2.3812, 101.9124],
                "areaKm2": 45.2,
                "volumeBbls": 18400,
                "confidence": 96.8,
                "sensor": "Sentinel-1A (C-Band IW VV+VH)",
                "detectedAt": "2026-09-16 04:12:44 UTC",
                "wind": "14 kt NW (310°)",
                "current": "1.8 kt SE (135°)",
                "surfaceTemp": "29.4°C",
                "slickType": "Heavy Crude Oil Emulsion",
                "thumbnail": "assets/images/sar_slick_detail.jpg",
                "primarySuspect": {
                    "name": "MT Ocean Vanguard",
                    "imo": 9482154,
                    "confidence": 94.8,
                    "matchType": "High Forensic Correlation"
                },
                "slickPolygon": [
                    [2.420, 101.860],
                    [2.435, 101.905],
                    [2.410, 101.960],
                    [2.370, 101.980],
                    [2.340, 101.930],
                    [2.355, 101.875],
                ],
            }
        ],
        "vessels": [
            {
                "name": "MT Ocean Vanguard",
                "imo": 9482154,
                "mmsi": 636019842,
                "flag": "Liberia",
                "type": "VLCC Crude Tanker",
                "length": "333m",
                "coords": [2.285, 102.120],
                "heading": 132,
                "speed": 13.8,
                "lastAisPing": "3 min ago",
                "isDarkVessel": True,
                "riskScore": 95,
                "trackHistory": [
                    [2.650, 101.450],
                    [2.540, 101.680],
                    [2.440, 101.880],
                    [2.350, 102.010],
                    [2.285, 102.120],
                ],
            },
            {
                "name": "Nordic Titan",
                "imo": 9310842,
                "mmsi": 538006214,
                "flag": "Marshall Islands",
                "type": "Capesize Bulk Carrier",
                "length": "292m",
                "coords": [2.480, 101.820],
                "heading": 130,
                "speed": 11.4,
                "lastAisPing": "45 sec ago",
                "isDarkVessel": False,
                "riskScore": 42,
                "trackHistory": [
                    [2.720, 101.350],
                    [2.600, 101.600],
                    [2.480, 101.820],
                ],
            },
        ],
    },
    "persian_gulf": {
        "spills": [
            {
                "id": "SG-PG-2101",
                "title": "Strait of Hormuz Offshore Slick",
                "severity": "high",
                "status": "UNDER INVESTIGATION",
                "coords": [26.45, 55.85],
                "areaKm2": 18.6,
                "volumeBbls": 5200,
                "confidence": 92.1,
                "sensor": "ICEYE-X12 (X-Band)",
                "detectedAt": "2026-09-17 02:34:12 UTC",
                "wind": "18 kt ENE (60°)",
                "current": "2.1 kt N (0°)",
                "surfaceTemp": "29.8°C",
                "slickType": "Fuel Oil Residue",
                "thumbnail": "assets/images/sar_slick_detail.jpg",
                "primarySuspect": {
                    "name": "Al Hadi Trader",
                    "imo": 9756023,
                    "confidence": 78.2,
                    "matchType": "High Confidence"
                },
                "slickPolygon": [
                    [26.47, 55.82],
                    [26.46, 55.88],
                    [26.42, 55.89],
                    [26.40, 55.84],
                ],
            }
        ],
        "vessels": [
            {
                "name": "Al Hadi Trader",
                "imo": 9756023,
                "mmsi": 412345678,
                "flag": "UAE",
                "type": "Product Tanker",
                "length": "188m",
                "coords": [26.46, 55.86],
                "heading": 90,
                "speed": 10.2,
                "lastAisPing": "2 min ago",
                "isDarkVessel": True,
                "riskScore": 78,
                "trackHistory": [
                    [26.50, 55.80],
                    [26.47, 55.85],
                    [26.46, 55.86],
                ],
            }
        ],
    },
    "north_sea": {
        "spills": [
            {
                "id": "SG-NS-3310",
                "title": "Dogger Bank Slick",
                "severity": "medium",
                "status": "UNDER INVESTIGATION",
                "coords": [55.10, 3.20],
                "areaKm2": 6.4,
                "volumeBbls": 1200,
                "confidence": 88.4,
                "sensor": "RADARSAT-2",
                "detectedAt": "2026-09-15 18:12:00 UTC",
                "wind": "16 kt NW (330°)",
                "current": "1.4 kt SW (225°)",
                "surfaceTemp": "15.6°C",
                "slickType": "Oily Water Separator Discharge",
                "thumbnail": "assets/images/sar_slick_detail.jpg",
                "primarySuspect": {
                    "name": "North Sea Carrier",
                    "imo": 9502048,
                    "confidence": 41.2,
                    "matchType": "Secondary Candidate"
                },
                "slickPolygon": [
                    [55.12, 3.18],
                    [55.11, 3.22],
                    [55.09, 3.21],
                    [55.08, 3.19],
                ],
            }
        ],
        "vessels": [
            {
                "name": "North Sea Carrier",
                "imo": 9502048,
                "mmsi": 225001122,
                "flag": "Norway",
                "type": "Chemical Tanker",
                "length": "164m",
                "coords": [55.11, 3.21],
                "heading": 45,
                "speed": 12.5,
                "lastAisPing": "41 sec ago",
                "isDarkVessel": False,
                "riskScore": 36,
                "trackHistory": [
                    [55.13, 3.12],
                    [55.11, 3.21],
                ],
            }
        ],
    },
    "gulf_mexico": {
        "spills": [
            {
                "id": "SG-GM-4420",
                "title": "Mississippi Canyon Outer Slick",
                "severity": "medium",
                "status": "FLAGGED PRELIMINARY",
                "coords": [28.75, -88.35],
                "areaKm2": 9.2,
                "volumeBbls": 2600,
                "confidence": 85.0,
                "sensor": "Sentinel-1B",
                "detectedAt": "2026-09-14 11:05:22 UTC",
                "wind": "12 kt SSW (210°)",
                "current": "1.9 kt WSW (250°)",
                "surfaceTemp": "27.8°C",
                "slickType": "Crude Oil Sheen",
                "thumbnail": "assets/images/sar_slick_detail.jpg",
                "primarySuspect": {
                    "name": "Gulf Mariner",
                    "imo": 9642001,
                    "confidence": 52.4,
                    "matchType": "Candidate Match"
                },
                "slickPolygon": [
                    [28.77, -88.40],
                    [28.76, -88.30],
                    [28.73, -88.32],
                ],
            }
        ],
        "vessels": [
            {
                "name": "Gulf Mariner",
                "imo": 9642001,
                "mmsi": 367001234,
                "flag": "USA",
                "type": "Offshore Supply Vessel",
                "length": "118m",
                "coords": [28.75, -88.35],
                "heading": 210,
                "speed": 9.1,
                "lastAisPing": "1 min ago",
                "isDarkVessel": False,
                "riskScore": 52,
                "trackHistory": [
                    [28.80, -88.42],
                    [28.75, -88.35],
                ],
            }
        ],
    },
}


@app.get("/api/regions/{region_key}")
def region_data(region_key: str) -> dict:
    """Return curated spill and vessel data for a monitoring region."""
    normalized = region_key.strip().lower()
    data = REGION_DATASETS.get(normalized)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Region not found: {region_key}")
    return {
        "region": normalized,
        "spills": data.get("spills", []),
        "vessels": data.get("vessels", []),
    }


# Mount last so API routes keep priority over static file paths.
app.mount("/", StaticFiles(directory=ROOT_DIR, html=True), name="site")

"""
Pydantic Data Models for SpillGuard FastAPI Server
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class PrimarySuspectModel(BaseModel):
    name: str
    imo: int
    confidence: float
    matchType: str


class SpillCreateModel(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    coords: List[float]
    areaKm2: float
    
    volumeBbls: int
    confidence: float
    sensor: str
    wind: str
    current: str
    surfaceTemp: str
    slickType: str
    primarySuspect: PrimarySuspectModel
    slickPolygon: List[List[float]]


class VesselNoteCreate(BaseModel):
    note: str
    author: Optional[str] = "Command Analyst"


class VesselFlagUpdate(BaseModel):
    isDarkVessel: bool
    riskLevel: str
    riskScore: int


class LoginRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = "commander"


class DossierGenerateRequest(BaseModel):
    incidentId: str
    accusedImo: int
    classificationLevel: Optional[str] = "LEVEL 3 FORENSIC EVIDENCE"


class AISPointModel(BaseModel):
    mmsi: str
    vessel_name: str
    lat: float
    lon: float
    timestamp: str
    speed_knots: Optional[float] = None
    heading: Optional[float] = None
    vessel_type: Optional[str] = None
    length_m: Optional[float] = None


class SARVesselModel(BaseModel):
    id: str
    lat: float
    lon: float
    heading: Optional[float] = None
    length_m: Optional[float] = None


class MatchVesselsRequest(BaseModel):
    sar_time: str
    sar_vessels: List[SARVesselModel]
    ais_points: List[AISPointModel]


class SarAisCorrelateRequest(BaseModel):
    sar_time: str
    sar_lat: float
    sar_lon: float
    sar_heading: Optional[float] = None
    sar_length_m: Optional[float] = None
    ais_records: List[AISPointModel]


class RankSuspectVesselModel(BaseModel):
    vessel_name: Optional[str] = None
    name: Optional[str] = None
    vessel_type: Optional[str] = None
    type: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed_knots: Optional[float] = None
    speed: Optional[float] = None
    timestamp: Optional[str] = None
    last_seen: Optional[str] = None
    ais_gap_minutes: Optional[float] = None
    ais_gap: Optional[float] = None
    is_dark_vessel: Optional[bool] = None
    dark_vessel: Optional[bool] = None


class RankSuspectsRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    release_start: str
    release_end: str
    vessels: List[RankSuspectVesselModel]


class DriftRequest(BaseModel):
    spill_lat: float
    spill_lon: float
    current_speed_mps: float
    current_direction_degrees: float
    hours: float

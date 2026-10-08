"""SQLAlchemy models.

Schema notes:
- Column types are standard (Integer/Float/String/Text/DateTime/Boolean) so the
  same schema works on SQLite (default) and PostgreSQL (DATABASE_URL override).
- Timestamps are written from Python as naive-UTC datetimes and serialized to
  ISO-8601 "....Z" strings by the API layer.
- The legacy tables (users, locations, environmental_data, predictions, alerts,
  field_reports) may already exist with fewer columns; app/schema.py applies
  additive ALTER TABLE migrations so first-run and upgrade-run both work.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)

from app.database.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    # Role values: ADMIN | ANALYST | VIEWER | FIELD_OFFICER (uppercase).
    role = Column(String, default="VIEWER")


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    state = Column(String, nullable=False)
    district = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    elevation = Column(Float, default=0)      # exposed as elevation_m
    slope = Column(Float, default=0)          # exposed as slope_deg

    # --- extended columns -------------------------------------------------
    region = Column(String, default="")       # operational zone (defaults to state)
    category = Column(String, default="landslide")  # landslide|flood|earthquake|cyclone|hydrological
    population = Column(Integer, default=0)
    land_cover = Column(String, default="mixed")
    risk_score = Column(Float, default=0)
    risk_level = Column(String, default="LOW")
    status = Column(String, default="NORMAL")  # NORMAL|WATCH|ALERT|CRITICAL
    assessed_at = Column(DateTime(timezone=True), nullable=True)

    # weather / soil fields (latest ingest)
    rainfall_mm_1h = Column(Float, default=0)
    rainfall_mm_6h = Column(Float, default=0)
    rainfall_mm_24h = Column(Float, default=0)
    forecast_24h_mm = Column(Float, default=0)
    temperature_c = Column(Float, default=0)
    humidity_pct = Column(Float, default=0)
    wind_kmh = Column(Float, default=0)
    pressure_hpa = Column(Float, default=1013.0)
    soil_moisture = Column(Float, default=0)
    weather_source = Column(String, default="simulated_fallback")
    weather_updated_at = Column(DateTime(timezone=True), nullable=True)

    # scenario (simulation) risk boost applied by the emergency demo mode
    scenario_boost = Column(Float, default=0.0)


class EnvironmentalData(Base):
    __tablename__ = "environmental_data"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    rainfall = Column(Float, default=0)
    soil_moisture = Column(Float, default=0)
    temperature = Column(Float, default=0)
    humidity = Column(Float, default=0)
    slope = Column(Float, default=0)
    recorded_at = Column(DateTime(timezone=True), server_default=None, nullable=True)


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    probability = Column(Float, nullable=False)
    risk_score = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False)
    model_version = Column(String, default="v1")
    created_at = Column(DateTime(timezone=True), server_default=None, nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    risk_score = Column(Float, nullable=False)
    # severity mirrors risk_level (kept for backwards compatibility)
    severity = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String, default="active")  # active|acknowledged|resolved
    created_at = Column(DateTime(timezone=True), server_default=None, nullable=True)

    # --- extended columns -------------------------------------------------
    risk_level = Column(String, default="HIGH")
    trigger = Column(String, name="trigger", quote=True, default="risk_threshold_exceeded")
    delivery_status = Column(String, default="SIMULATED_LOCAL")
    simulation = Column(Boolean, default=False)
    acknowledged_by = Column(String, nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)


class FieldReport(Base):
    __tablename__ = "field_reports"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    description = Column(Text, nullable=False)
    severity = Column(String, default="medium")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    image_path = Column(String, nullable=True)
    status = Column(String, default="submitted")
    created_at = Column(DateTime(timezone=True), server_default=None, nullable=True)


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String, unique=True, index=True, nullable=False)  # INC-2026-0001
    type = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    location_name = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    severity = Column(String, nullable=False)   # LOW|MEDIUM|HIGH|CRITICAL
    status = Column(String, default="OPEN")     # OPEN|INVESTIGATING|RESOLVED|CLOSED
    reporter = Column(String, default="field")
    region = Column(String, default="")
    assigned_to = Column(String, nullable=True)
    image_b64 = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)


class Corridor(Base):
    __tablename__ = "corridors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    route = Column(String, nullable=False)
    from_location = Column(String, default="")
    to_location = Column(String, default="")
    status = Column(String, default="open")     # open|blocked|restricted
    risk_level = Column(String, default="LOW")
    blockage = Column(String, default="")
    incident_count = Column(Integer, default=0)
    last_update = Column(DateTime(timezone=True), nullable=True)
    demo = Column(Boolean, default=True)        # reference/demo route data


class Infrastructure(Base):
    __tablename__ = "infrastructure"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    region = Column(String, default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    criticality = Column(String, default="MEDIUM")  # LOW|MEDIUM|HIGH|CRITICAL
    status = Column(String, default="operational")  # operational|impaired|closed
    risk_score = Column(Float, default=0)


class ScenarioEvent(Base):
    __tablename__ = "scenario_events"

    id = Column(Integer, primary_key=True, index=True)
    step = Column(Integer, default=0)
    type = Column(String, default="scenario")   # scenario|scenario_alert|scenario_risk
    message = Column(Text, nullable=False)
    location = Column(String, default="")
    severity = Column(String, default="INFO")
    simulation = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=True)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)  # JSON-encoded
    updated_at = Column(DateTime(timezone=True), nullable=True)


class PipelineJob(Base):
    __tablename__ = "pipeline_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String, nullable=False, index=True)
    status = Column(String, default="RUNNING")  # RUNNING|SUCCESS|FAILED
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    message = Column(Text, default="")


class SoilSnapshot(Base):
    __tablename__ = "soil_snapshots"

    location_id = Column(Integer, ForeignKey("locations.id"), primary_key=True)
    layers_json = Column(Text, default="[]")  # [{label, moisture, saturation_pct, status}]
    source = Column(String, default="demo")
    data_source = Column(String, default="simulated")
    observed_at = Column(DateTime(timezone=True), nullable=True)

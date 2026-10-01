import enum
from datetime import datetime
from typing import List, Optional
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Enum, Text
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class UserRole(enum.Enum):
    ADMIN = "ADMIN"
    FIELD_OFFICER = "FIELD_OFFICER"

class RiskLevel(enum.Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class AlertStatus(enum.Enum):
    NEW = "NEW"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED = "RESOLVED"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.FIELD_OFFICER)
    created_at = Column(DateTime, default=datetime.utcnow)

class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    state = Column(String, nullable=False)
    district = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    elevation = Column(Float)
    slope = Column(Float)
    historical_frequency = Column(Float, default=0.0)
    land_cover_risk = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    readings = relationship("EnvironmentalReading", back_populates="location")
    predictions = relationship("Prediction", back_populates="location")

class EnvironmentalReading(Base):
    __tablename__ = "environmental_readings"
    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    rainfall = Column(Float)
    rainfall_accumulation = Column(Float)
    soil_moisture = Column(Float)
    temperature = Column(Float)
    humidity = Column(Float)
    slope_movement = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    location = relationship("Location", back_populates="readings")

class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    probability = Column(Float, nullable=False)
    risk_score = Column(Integer, nullable=False)
    risk_level = Column(Enum(RiskLevel), nullable=False)
    top_factors = Column(Text) # Stored as comma-separated or JSON string
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    location = relationship("Location", back_populates="predictions")

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    prediction_id = Column(Integer, ForeignKey("predictions.id"), nullable=False)
    risk_level = Column(Enum(RiskLevel), nullable=False)
    trigger_reason = Column(Text)
    status = Column(Enum(AlertStatus), default=AlertStatus.NEW)
    assigned_officer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)

class FieldReport(Base):
    __tablename__ = "field_reports"
    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    latitude = Column(Float)
    longitude = Column(Float)
    observation = Column(Text, nullable=False)
    severity = Column(Enum(RiskLevel), nullable=False)
    description = Column(Text)
    photo_url = Column(String)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    risk_level = Column(Enum(RiskLevel))
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)

class SimulationSession(Base):
    __tablename__ = "simulation_sessions"
    id = Column(Integer, primary_key=True, index=True)
    scenario_name = Column(String)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    status = Column(String) # ACTIVE, PAUSED, STOPPED

class ModelVersion(Base):
    __tablename__ = "model_versions"
    id = Column(Integer, primary_key=True, index=True)
    version_tag = Column(String, nullable=False)
    accuracy = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    model_path = Column(String, nullable=False)
    trained_at = Column(DateTime, default=datetime.utcnow)

class ImpactAsset(Base):
    __tablename__ = "impact_assets"
    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    asset_type = Column(String) # Road, Village, School, Hospital
    asset_name = Column(String)
    population_estimate = Column(Integer, default=0)
    criticality = Column(String) # High, Medium, Low

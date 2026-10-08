"""Idempotent first-boot seed data.

Everything here checks for existing rows before inserting, so restarting the
server never duplicates data:

- 4 seeded users (ADMIN / ANALYST / VIEWER / FIELD_OFFICER)
- 45 monitored locations across NE India (Assam, Arunachal, Meghalaya,
  Manipur, Mizoram, Nagaland, Tripura, Sikkim, West Bengal north, Bihar
  border) with weather + soil fields and a deterministic prototype risk score
- 12 road corridors (open / blocked / restricted)
- 10 critical infrastructure assets
- 20 incidents across statuses/severities with generated ids INC-YYYY-NNNN
- environmental + prediction history (for trends/analytics/temporal charts)
- alerts derived from the configured thresholds (dedup applied)
- default system settings
"""

import math
import random
from datetime import timedelta

from sqlalchemy.exc import IntegrityError

from app import config
from app.models.entities import (
    Corridor,
    EnvironmentalData,
    Incident,
    Infrastructure,
    Location,
    Prediction,
    SystemSetting,
    User,
)
from app.prediction_engine import classify_score, score_features
from app.security import hash_password
from app.services.common import (
    get_bands,
    iso,
    level_for_score,
    next_incident_public_id,
    recompute_location_risk,
    set_setting,
    utcnow,
)

# name, state, district, lat, lon, category, population, elevation, slope,
# land_cover, rainfall_mm_24h, rainfall_mm_6h (derived), soil_moisture, temperature_c
# (rainfall_mm_6h is stored so that rainfall_24h + 2*rainfall_6h equals the
# antecedent 72h total used by the risk engine)
LOCATIONS = [
    # Assam
    ("Guwahati", "Assam", "Kamrup Metropolitan", 26.1445, 91.7362, "flood", 620000, 55, 6, "urban", 140, 320, 82, 29),
    ("Dibrugarh", "Assam", "Dibrugarh", 27.4728, 94.9120, "flood", 150000, 110, 4, "agriculture", 90, 200, 70, 28),
    ("Silchar", "Assam", "Cachar", 24.8333, 92.7789, "flood", 230000, 25, 5, "agriculture", 110, 260, 78, 30),
    ("Tezpur", "Assam", "Sonitpur", 26.6333, 92.8000, "hydrological", 100000, 48, 5, "agriculture", 75, 160, 62, 29),
    ("Jorhat", "Assam", "Jorhat", 26.7509, 94.2037, "hydrological", 150000, 130, 7, "agriculture", 55, 120, 55, 28),
    ("Barpeta", "Assam", "Barpeta", 26.3224, 91.0060, "flood", 60000, 40, 3, "agriculture", 12, 25, 30, 31),
    # Arunachal Pradesh
    ("Itanagar", "Arunachal Pradesh", "Papum Pare", 27.0844, 93.6053, "landslide", 65000, 440, 22, "forest", 95, 210, 70, 27),
    ("Pasighat", "Arunachal Pradesh", "East Siang", 28.0667, 95.3333, "flood", 65000, 150, 6, "agriculture", 105, 230, 74, 28),
    ("Tawang", "Arunachal Pradesh", "Tawang", 27.5863, 91.8687, "landslide", 11000, 3200, 45, "forest", 175, 420, 88, 18),
    ("Ziro", "Arunachal Pradesh", "Lower Subansiri", 27.6366, 93.8374, "landslide", 20000, 1688, 30, "forest", 140, 330, 80, 22),
    ("Bomdila", "Arunachal Pradesh", "West Kameng", 27.2550, 92.4080, "landslide", 15000, 2500, 38, "forest", 120, 280, 74, 16),
    ("Naharlagun", "Arunachal Pradesh", "Papum Pare", 27.1520, 93.8960, "earthquake", 45000, 350, 15, "urban", 45, 100, 52, 27),
    # Meghalaya
    ("Shillong", "Meghalaya", "East Khasi Hills", 25.5788, 91.8933, "landslide", 350000, 1525, 28, "urban", 150, 340, 84, 20),
    ("Jowai", "Meghalaya", "West Jaintia Hills", 25.1800, 92.2800, "landslide", 30000, 1380, 34, "urban", 125, 290, 79, 22),
    ("Tura", "Meghalaya", "West Garo Hills", 25.5100, 90.2200, "landslide", 75000, 640, 20, "agriculture", 85, 190, 68, 26),
    ("Nongstoin", "Meghalaya", "West Khasi Hills", 25.5200, 91.5800, "landslide", 15000, 1400, 30, "forest", 65, 150, 58, 21),
    # Manipur
    ("Imphal", "Manipur", "Imphal West", 24.8170, 93.9368, "earthquake", 410000, 780, 8, "urban", 60, 130, 55, 26),
    ("Churachandpur", "Manipur", "Churachandpur", 24.3333, 93.7000, "landslide", 60000, 900, 32, "bare", 155, 360, 86, 24),
    ("Ukhrul", "Manipur", "Ukhrul", 24.9200, 94.3600, "landslide", 25000, 1668, 36, "forest", 105, 240, 72, 21),
    ("Thoubal", "Manipur", "Thoubal", 24.6300, 93.9800, "flood", 40000, 764, 6, "agriculture", 40, 90, 50, 28),
    # Mizoram
    ("Aizawl", "Mizoram", "Aizawl", 23.7271, 92.7176, "landslide", 300000, 1132, 35, "urban", 118, 270, 75, 24),
    ("Lunglei", "Mizoram", "Lunglei", 22.8800, 92.7300, "landslide", 60000, 1050, 30, "agriculture", 70, 160, 60, 25),
    ("Champhai", "Mizoram", "Champhai", 23.8300, 93.3300, "landslide", 30000, 1280, 28, "forest", 45, 105, 50, 23),
    ("Serchhip", "Mizoram", "Serchhip", 23.3100, 92.8300, "landslide", 20000, 1100, 34, "forest", 35, 80, 45, 25),
    # Nagaland
    ("Kohima", "Nagaland", "Kohima", 25.6751, 94.1086, "landslide", 100000, 1447, 35, "urban", 90, 200, 70, 22),
    ("Dimapur", "Nagaland", "Dimapur", 25.9050, 93.7260, "flood", 170000, 260, 6, "urban", 50, 110, 55, 28),
    ("Mokokchung", "Nagaland", "Mokokchung", 26.3200, 94.5200, "landslide", 45000, 1200, 30, "forest", 30, 70, 45, 24),
    ("Tuensang", "Nagaland", "Tuensang", 26.2800, 94.8300, "landslide", 25000, 890, 25, "forest", 20, 45, 38, 26),
    # Tripura
    ("Agartala", "Tripura", "West Tripura", 23.8315, 91.2868, "flood", 520000, 15, 4, "urban", 80, 180, 65, 30),
    ("Udaipur", "Tripura", "Gomati", 23.5300, 91.4900, "flood", 35000, 20, 5, "agriculture", 25, 60, 42, 31),
    ("Dharmanagar", "Tripura", "North Tripura", 24.3000, 92.1300, "flood", 55000, 25, 4, "agriculture", 15, 35, 35, 30),
    ("Kailashahar", "Tripura", "Unakoti", 24.3300, 92.0200, "flood", 30000, 28, 5, "agriculture", 10, 25, 32, 30),
    # Sikkim
    ("Gangtok", "Sikkim", "East Sikkim", 27.3389, 88.6065, "landslide", 100000, 1650, 42, "urban", 190, 430, 90, 17),
    ("Mangan", "Sikkim", "North Sikkim", 27.5200, 88.5300, "landslide", 15000, 1900, 40, "forest", 75, 170, 62, 15),
    ("Namchi", "Sikkim", "South Sikkim", 27.1667, 88.3500, "landslide", 40000, 1300, 32, "agriculture", 55, 125, 58, 20),
    # West Bengal (north)
    ("Siliguri", "West Bengal", "Darjeeling", 26.7271, 88.3953, "flood", 700000, 115, 6, "urban", 95, 210, 70, 30),
    ("Darjeeling", "West Bengal", "Darjeeling", 27.0360, 88.2627, "landslide", 120000, 2042, 40, "urban", 65, 150, 60, 18),
    ("Kurseong", "West Bengal", "Darjeeling", 26.8800, 88.2800, "landslide", 40000, 1520, 35, "forest", 40, 95, 52, 20),
    ("Jalpaiguri", "West Bengal", "Jalpaiguri", 26.5200, 88.7200, "flood", 140000, 75, 4, "agriculture", 30, 70, 48, 31),
    ("Cooch Behar", "West Bengal", "Cooch Behar", 26.3300, 89.4700, "flood", 80000, 40, 5, "agriculture", 20, 45, 40, 31),
    # Bihar (border districts)
    ("Kishanganj", "Bihar", "Kishanganj", 25.9800, 87.9300, "flood", 130000, 35, 5, "agriculture", 55, 130, 58, 30),
    ("Araria", "Bihar", "Araria", 26.1300, 87.4500, "flood", 95000, 45, 5, "agriculture", 12, 28, 30, 31),
    ("Supaul", "Bihar", "Supaul", 26.1200, 86.6000, "flood", 70000, 30, 4, "agriculture", 8, 20, 28, 32),
    ("Madhepura", "Bihar", "Madhepura", 25.9200, 86.8700, "flood", 65000, 35, 4, "agriculture", 18, 40, 38, 32),
    ("Saharsa", "Bihar", "Saharsa", 25.9900, 86.5900, "flood", 90000, 40, 4, "agriculture", 12, 30, 35, 33),
]

CORRIDORS = [
    ("NH-10 (Siliguri-Gangtok)", "NH-10", "Siliguri", "Gangtok", "blocked", "VERY_HIGH",
     "Landslide blocking Teesta bridge approach; detour via Rangpo pending", 3),
    ("NH-27 (Siliguri-Guwahati)", "NH-27", "Siliguri", "Guwahati", "restricted", "HIGH",
     "Waist-deep waterlogging at Chayani Bazaar; heavy vehicles only", 2),
    ("NH-106E (Shillong-Jowai)", "NH-106E", "Shillong", "Jowai", "restricted", "HIGH",
     "Slope debris on carriageway; single-lane alternating traffic", 1),
    ("NH-6 (Guwahati-Shillong)", "NH-6", "Guwahati", "Shillong", "open", "MODERATE", "", 0),
    ("NH-2 (Dimapur-Kohima)", "NH-2", "Dimapur", "Kohima", "open", "MODERATE", "", 1),
    ("NH-150 (Aizawl-Lunglei)", "NH-150", "Aizawl", "Lunglei", "blocked", "VERY_HIGH",
     "Slope failure near Thenzawl; clearance crews dispatched", 2),
    ("NH-102 (Imphal-Churachandpur)", "NH-102", "Imphal", "Churachandpur", "restricted", "HIGH",
     "Slippery sections and falling debris; daylight travel only", 1),
    ("NH-37 (Tinsukia-Pasighat)", "NH-37", "Tinsukia", "Pasighat", "open", "MODERATE", "", 0),
    ("NH-54 (Aizawl-Silchar)", "NH-54", "Aizawl", "Silchar", "open", "MODERATE", "", 1),
    ("NH-8 (Agartala-Udaipur)", "NH-8", "Agartala", "Udaipur", "open", "LOW", "", 0),
    ("NH-13 (Roing-Tezu)", "NH-13", "Roing", "Tezu", "open", "MODERATE", "", 0),
    ("NH-139 (Kishanganj-Araria)", "NH-139", "Kishanganj", "Araria", "restricted", "MODERATE",
     "Embankment washout at one crossing; light vehicles only", 1),
]

INFRASTRUCTURE = [
    ("Saraighat Bridge", "bridge", "Assam", 26.1447, 91.7362, "CRITICAL", "impaired", 74),
    ("Ranganadi Dam", "dam", "Arunachal Pradesh", 27.5500, 93.8500, "CRITICAL", "operational", 66),
    ("Lokpriya Gopinath Bordoloi International Airport", "airport", "Assam", 26.1069, 91.5963, "HIGH", "operational", 58),
    ("Umiam Dam (Barapani)", "dam", "Meghalaya", 25.6500, 91.8800, "HIGH", "operational", 61),
    ("Kopili Hydro Electric Station", "power_plant", "Assam", 25.6000, 92.6000, "HIGH", "impaired", 69),
    ("Gauhati Medical College Hospital", "hospital", "Assam", 26.1600, 91.7700, "MEDIUM", "operational", 52),
    ("Shillong Telecom Hub", "telecom", "Meghalaya", 25.5800, 91.8900, "MEDIUM", "operational", 47),
    ("Imphal Water Supply Plant", "water_treatment", "Manipur", 24.8100, 93.9400, "HIGH", "operational", 63),
    ("Agartala Thermal Power Station", "power_plant", "Tripura", 23.8400, 91.2900, "MEDIUM", "operational", 44),
    ("Kohima Civil Hospital", "hospital", "Nagaland", 25.6700, 94.1100, "MEDIUM", "operational", 39),
]

# type, description, location index, severity, status, reporter, region override, days_ago
INCIDENTS = [
    ("LANDSLIDE", "Debris flow above NH-10 near Teesta, road cut off", 32, "CRITICAL", "OPEN", "field_team_sikkim", "", 0.20),
    ("FLOOD", "Brahmaputra embankment breach near Chandrapur; 3 hamlets inundated", 0, "CRITICAL", "INVESTIGATING", "water_resources", "", 0.50),
    ("EARTHQUAKE", "M4.6 tremor cluster; minor structural damage reported", 25, "HIGH", "OPEN", "seismology_cell", "", 1.00),
    ("RIVER_OVERFLOW", "Barak river above danger level at Sonai", 2, "HIGH", "OPEN", "water_resources", "", 0.80),
    ("LANDSLIDE", "Slope failure above Tawang road; clearance in progress", 8, "HIGH", "INVESTIGATING", "pwd_arunachal", "", 2.00),
    ("FLOOD", "Tea garden inundated near Dibrugarh; 400 evacuated", 1, "MEDIUM", "INVESTIGATING", "district_admin", "", 1.50),
    ("ROAD_BLOCK", "Tree fall blocking NH-106E near Jowai", 13, "LOW", "CLOSED", "field_team_jowai", "", 4.00),
    ("STORM", "Northeaster gusts damage roofs in Aizawl", 20, "MEDIUM", "RESOLVED", "imd_feed", "", 6.00),
    ("CYCLONE", "Post-cyclone gust damage and power outages in Agartala", 28, "MEDIUM", "CLOSED", "imd_feed", "", 5.50),
    ("FLOOD", "Urban waterlogging across 12 wards in Guwahati", 0, "LOW", "RESOLVED", "gmc_guwahati", "", 3.00),
    ("FLASH_FLOOD", "Mountain stream surge near Shillong; vehicles washed away", 12, "HIGH", "RESOLVED", "field_team_shillong", "", 4.50),
    ("SINKHOLE", "Road subsidence on Aizawl bypass", 20, "HIGH", "OPEN", "pwd_mizoram", "", 1.20),
    ("DAM_WARNING", "Seepage observation at Ranganadi Dam - precautionary warning", 6, "CRITICAL", "OPEN", "dam_safety_board", "", 0.30),
    ("LANDSLIDE", "Slope crack reported above Mangan residential area", 33, "MEDIUM", "OPEN", "field_team_sikkim", "", 2.50),
    ("FLOOD", "Low-lying chars inundated in Barpeta", 5, "LOW", "INVESTIGATING", "district_admin", "", 3.50),
    ("ROAD_BLOCK", "Landslide debris across NH-150 near Lunglei", 21, "HIGH", "OPEN", "pwd_mizoram", "", 0.90),
    ("EARTHQUAKE", "Aftershock survey - 6 structures flagged for inspection", 16, "MEDIUM", "CLOSED", "seismology_cell", "", 6.50),
    ("FLOOD", "Embankment erosion threatens settlement near Kishanganj", 40, "MEDIUM", "OPEN", "water_resources", "", 1.80),
    ("FLASH_FLOOD", "Debris flow onto NH-10 at Mangan", 33, "CRITICAL", "INVESTIGATING", "field_team_sikkim", "", 0.15),
    ("FLOOD", "Wetland breach near Siliguri; farmland under water", 35, "MEDIUM", "RESOLVED", "district_admin", "", 2.80),
]

USERS = [
    ("TerraGuard Admin", "admin@terraguard.local", "admin123", "ADMIN"),
    ("Risk Analyst", "analyst@terraguard.local", "analyst123", "ANALYST"),
    ("Read-only Viewer", "viewer@terraguard.local", "viewer123", "VIEWER"),
    ("Field Officer", "field@terraguard.local", "field123", "FIELD_OFFICER"),
]


def seed_users(db) -> None:
    for name, email, password, role in USERS:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            db.add(User(name=name, email=email, hashed_password=hash_password(password), role=role))
        else:
            user.role = role
            user.hashed_password = hash_password(password)
    db.commit()


def seed_settings(db) -> None:
    if db.get(SystemSetting, "thresholds") is None:
        set_setting(db, "thresholds", {k: dict(v) for k, v in config.DEFAULT_BANDS.items()})
    if db.get(SystemSetting, "region") is None:
        set_setting(db, "region", "Northeast India")
        set_setting(db, "language", "en")
        set_setting(db, "refresh_interval_seconds", config.DASHBOARD_REFRESH_SECONDS)
        set_setting(
            db,
            "notifications",
            {"email": False, "sms": False, "in_app": True, "delivery_mode": "SIMULATED_LOCAL"},
        )
    if db.get(SystemSetting, "seeded_at") is None:
        set_setting(db, "seeded_at", iso(utcnow()))
    db.commit()


def seed_locations(db) -> None:
    if db.query(Location).count() > 0:
        return
    bands = get_bands(db)
    now = utcnow()
    for index, row in enumerate(LOCATIONS):
        (
            name, state, district, lat, lon, category, population,
            elevation, slope, land_cover, rain24, recent72, soil, temperature,
        ) = row
        rain6 = round((recent72 - rain24) / 2.0, 1)
        loc = Location(
            name=name,
            state=state,
            district=district,
            region=state,
            latitude=lat,
            longitude=lon,
            elevation=float(elevation),
            slope=float(slope),
            category=category,
            population=population,
            land_cover=land_cover,
            rainfall_mm_1h=round(rain24 / 24.0, 2),
            rainfall_mm_6h=rain6,
            rainfall_mm_24h=float(rain24),
            forecast_24h_mm=round(rain24 * 0.5, 1),
            temperature_c=float(temperature),
            humidity_pct=min(99.0, soil + 8.0),
            wind_kmh=round(8.0 + (index * 3) % 25, 1),
            pressure_hpa=round(1005.0 + (index % 10), 1),
            soil_moisture=float(soil),
            weather_source="simulated_fallback",
            weather_updated_at=now - timedelta(minutes=12),
        )
        db.add(loc)
        db.flush()
        recompute_location_risk(db, loc, bands=bands)
        loc.assessed_at = now - timedelta(minutes=5 + index % 20)
    db.commit()


def seed_corridors(db) -> None:
    if db.query(Corridor).count() > 0:
        return
    now = utcnow()
    for index, row in enumerate(CORRIDORS):
        name, route, from_loc, to_loc, status, risk_level, blockage, count = row
        db.add(
            Corridor(
                name=name,
                route=route,
                from_location=from_loc,
                to_location=to_loc,
                status=status,
                risk_level=risk_level,
                blockage=blockage,
                incident_count=count,
                last_update=now - timedelta(minutes=17 * (index + 1)),
                demo=True,
            )
        )
    db.commit()


def seed_infrastructure(db) -> None:
    if db.query(Infrastructure).count() > 0:
        return
    for name, kind, region, lat, lon, criticality, status, risk in INFRASTRUCTURE:
        db.add(
            Infrastructure(
                name=name,
                type=kind,
                region=region,
                latitude=lat,
                longitude=lon,
                criticality=criticality,
                status=status,
                risk_score=float(risk),
            )
        )
    db.commit()


def seed_incidents(db) -> None:
    if db.query(Incident).count() > 0:
        return
    now = utcnow()
    for kind, description, loc_index, severity, status, reporter, region_override, days_ago in INCIDENTS:
        loc = db.query(Location).offset(loc_index).first()
        if loc is None:
            loc = db.query(Location).first()
        created = now - timedelta(days=days_ago, hours=(loc_index * 7) % 12)
        public_id = next_incident_public_id(db, year=created.year)
        # Another worker may have claimed this id in a concurrent boot.
        if db.query(Incident.id).filter(Incident.public_id == public_id).first():
            continue
        db.add(
            Incident(
                public_id=public_id,
                type=kind,
                description=description,
                location_name=loc.name,
                latitude=loc.latitude,
                longitude=loc.longitude,
                severity=severity,
                status=status,
                reporter=reporter,
                region=region_override or loc.state,
                created_at=created,
                updated_at=min(now, created + timedelta(hours=2)),
            )
        )
        # flush so next_incident_public_id() sees the row just added
        db.flush()
    try:
        db.commit()
    except IntegrityError:
        # Concurrent first boot (two workers): the other writer won the race
        # for an INC-YYYY-NNNN id. Its rows are now visible - nothing to do.
        db.rollback()


def seed_history(db) -> None:
    """Environmental (hourly 24h + 6-hourly to 7d) and prediction history."""
    if db.query(EnvironmentalData).count() > 0 and db.query(Prediction).count() > 0:
        return
    bands = get_bands(db)
    now = utcnow().replace(minute=0, second=0, microsecond=0)
    locations = db.query(Location).order_by(Location.id).all()
    rng = random.Random(20261007)

    for loc in locations:
        # hourly for the last 24h, then every 6h out to 7 days
        offsets = list(range(0, 24)) + list(range(24 * 4, 24 * 7, 6))
        base_rain = float(loc.rainfall_mm_24h or 0)
        base_soil = float(loc.soil_moisture or 0)
        base_temp = float(loc.temperature_c or 25)
        for offset in offsets:
            moment = now - timedelta(hours=offset)
            factor = 0.55 + 0.45 * abs(math.sin((loc.id * 17 + offset) * 0.31))
            rainfall = round(base_rain * factor, 2)
            soil = round(max(5.0, min(99.0, base_soil * (0.85 + 0.15 * factor))), 1)
            temperature = round(base_temp + math.sin(offset * 0.5 + loc.id) * 3.0, 1)
            humidity = round(min(99.0, max(20.0, soil + 8.0)), 1)
            db.add(
                EnvironmentalData(
                    location_id=loc.id,
                    rainfall=rainfall,
                    soil_moisture=soil,
                    temperature=temperature,
                    humidity=humidity,
                    slope=loc.slope,
                    recorded_at=moment,
                )
            )
            if offset % 6 == 0:
                result = score_features(
                    rainfall=rainfall,
                    soil_moisture=soil,
                    slope=float(loc.slope or 0),
                    elevation=float(loc.elevation or 0),
                    land_cover=loc.land_cover or "mixed",
                    recent_rainfall=round(rainfall * 2.2, 1),
                    temperature=temperature,
                    bands=bands,
                )
                db.add(
                    Prediction(
                        location_id=loc.id,
                        probability=round(result["risk_score"] / 100.0, 3),
                        risk_score=result["risk_score"],
                        risk_level=result["risk_level"],
                        model_version=config.MODEL_VERSION,
                        created_at=moment,
                    )
                )
    db.commit()
    rng.random()  # keep the seeded rng exercised for future extensions


def seed_all(db) -> dict:
    """Run every seed step; safe to call on each boot."""
    seed_users(db)
    seed_settings(db)
    seed_locations(db)
    seed_corridors(db)
    seed_infrastructure(db)
    seed_history(db)
    seed_incidents(db)
    return {
        "users": db.query(User).count(),
        "locations": db.query(Location).count(),
        "corridors": db.query(Corridor).count(),
        "infrastructure": db.query(Infrastructure).count(),
        "incidents": db.query(Incident).count(),
        "environmental_records": db.query(EnvironmentalData).count(),
        "predictions": db.query(Prediction).count(),
    }

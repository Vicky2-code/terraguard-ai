"""Schema bootstrap.

`Base.metadata.create_all` creates every table on first boot. The dev SQLite
database may pre-date some columns (legacy prototype schema), so we also apply
additive `ALTER TABLE ... ADD COLUMN` migrations for the legacy tables.
PostgreSQL starts from a fresh schema (create_all) so it never needs this.
"""

from sqlalchemy import inspect, text

from app.database.db import Base
from app.models import entities  # noqa: F401  (registers every table on Base)

# Legacy tables -> columns that may be missing on an old database.
_LEGACY_EXTRA_COLUMNS = {
    "users": [
        ("role", "VARCHAR"),
    ],
    "locations": [
        ("region", "VARCHAR"),
        ("category", "VARCHAR"),
        ("population", "INTEGER"),
        ("land_cover", "VARCHAR"),
        ("risk_score", "FLOAT"),
        ("risk_level", "VARCHAR"),
        ("status", "VARCHAR"),
        ("assessed_at", "TIMESTAMP"),
        ("rainfall_mm_1h", "FLOAT"),
        ("rainfall_mm_6h", "FLOAT"),
        ("rainfall_mm_24h", "FLOAT"),
        ("forecast_24h_mm", "FLOAT"),
        ("temperature_c", "FLOAT"),
        ("humidity_pct", "FLOAT"),
        ("wind_kmh", "FLOAT"),
        ("pressure_hpa", "FLOAT"),
        ("soil_moisture", "FLOAT"),
        ("weather_source", "VARCHAR"),
        ("weather_updated_at", "TIMESTAMP"),
        ("scenario_boost", "FLOAT"),
    ],
    "environmental_data": [
        ("recorded_at", "TIMESTAMP"),
    ],
    "predictions": [
        ("created_at", "TIMESTAMP"),
    ],
    "alerts": [
        ("risk_level", "VARCHAR"),
        ('"trigger"', "VARCHAR"),  # quoted: TRIGGER is a keyword
        ("delivery_status", "VARCHAR"),
        ("simulation", "BOOLEAN"),
        ("acknowledged_by", "VARCHAR"),
        ("acknowledged_at", "TIMESTAMP"),
        ("updated_at", "TIMESTAMP"),
    ],
    "field_reports": [
        ("created_at", "TIMESTAMP"),
    ],
}


def ensure_schema(engine) -> None:
    Base.metadata.create_all(engine)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table, columns in _LEGACY_EXTRA_COLUMNS.items():
        if table not in existing_tables:
            continue
        have = {col["name"] for col in inspector.get_columns(table)}
        for col_name, col_type in columns:
            plain = col_name.strip('"')
            if plain in have:
                continue
            with engine.begin() as conn:
                conn.execute(
                    text(f'ALTER TABLE {table} ADD COLUMN {col_name} {col_type}')
                )

"""Regression: PostgreSQL `TIMESTAMP WITH TIME ZONE` columns return tz-aware
datetimes, while bucket math in the analytics endpoints is naive-UTC.

On SQLite (tests/default local dev) values come back naive, so this only fails
in production. These tests simulate the Postgres shape directly.
"""

from datetime import datetime, timedelta, timezone

from app.routes.analytics import _bucket_of, _bucket_starts
from app.services.common import age_seconds, iso, naive_utc


def test_bucket_of_handles_tz_aware_moment():
    base = datetime(2026, 1, 1, 0, 0, 0)
    starts = [base + timedelta(hours=i) for i in range(6)]
    # Postgres returns offset-aware datetimes; naive starts must not raise.
    aware = base.replace(tzinfo=timezone.utc) + timedelta(hours=2, minutes=30)
    assert _bucket_of(starts, aware) == base + timedelta(hours=2)


def test_bucket_of_handles_none():
    assert _bucket_of([datetime(2026, 1, 1)], None) is None


def test_naive_utc_strips_tzinfo():
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    assert naive_utc(aware) == aware.replace(tzinfo=None)
    assert naive_utc(None) is None
    assert naive_utc(aware.replace(tzinfo=None)) == aware.replace(tzinfo=None)


def test_iso_serializes_aware_as_naive_utc():
    assert iso(datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)) == "2026-01-01T12:00:00Z"


def test_age_seconds_accepts_aware_datetime():
    age = age_seconds(datetime.now(timezone.utc) - timedelta(seconds=30))
    assert age is not None and 0 <= age <= 60


def test_bucket_starts_is_naive_utc():
    start = datetime(2026, 1, 1, 10, 37, 0)
    starts = _bucket_starts(start, start + timedelta(hours=3), "hour")
    assert all(s.tzinfo is None for s in starts)
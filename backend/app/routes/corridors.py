"""Reference data endpoints: road corridors and critical infrastructure."""

from fastapi import APIRouter, Depends, Query

from app.database.db import get_db
from app.models.entities import Corridor, Infrastructure
from app.services.common import corridor_dict, infrastructure_dict, iso, utcnow

router = APIRouter(prefix="/api", tags=["Reference data"])


@router.get("/corridors")
def list_corridors(
    status: str | None = Query(None, description="open | blocked | restricted"),
    db=Depends(get_db),
):
    query = db.query(Corridor)
    if status:
        query = query.filter(Corridor.status == status.strip().lower())
    rows = query.order_by(Corridor.id).all()
    items = [corridor_dict(row) for row in rows]
    # contract: always flagged as demo/reference route data
    for item in items:
        item["demo"] = True
    return items


@router.get("/infrastructure")
def list_infrastructure(
    criticality: str | None = Query(None),
    db=Depends(get_db),
):
    query = db.query(Infrastructure)
    if criticality:
        query = query.filter(Infrastructure.criticality == criticality.strip().upper())
    return [infrastructure_dict(row) for row in query.order_by(Infrastructure.id).all()]

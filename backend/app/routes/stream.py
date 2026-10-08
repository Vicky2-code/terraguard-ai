"""GET /api/stream - Server-Sent Events.

Events: heartbeat (every 15s, also emitted as an SSE comment line),
risk_update, alert_created, incident_created, scenario_step, weather_update,
pipeline_status, settings_changed. Payload: {type, data, ts}.

Resume: ?since=<seq> (or the standard Last-Event-ID header) replays buffered
events after that sequence number.
"""

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.events import broker, sse_format
from app.services.common import iso, utcnow

router = APIRouter(prefix="/api", tags=["Realtime"])

HEARTBEAT_SECONDS = 15


@router.get("/stream")
async def stream(request: Request, since: int | None = None):
    resume = since
    if resume is None:
        header = request.headers.get("last-event-id")
        if header and header.isdigit():
            resume = int(header)

    queue = broker.subscribe()

    async def generator():
        try:
            # replay buffered events for reconnection
            for event in broker.history_since(resume):
                yield sse_format(event)
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    # keep-alive: SSE comment (robust through proxies) + heartbeat event
                    now = iso(utcnow())
                    yield f": heartbeat {now}\n\n"
                    yield sse_format({"seq": 0, "type": "heartbeat", "data": {"ts": now}, "ts": now})
                    continue
                yield sse_format(event)
        finally:
            broker.unsubscribe(queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

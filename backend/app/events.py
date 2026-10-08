"""In-process SSE (Server-Sent Events) broker.

- Thread-safe `publish()` so APScheduler background jobs and FastAPI handlers
  can both broadcast.
- Keeps a bounded history with monotonic sequence ids so clients can resume
  with `?since=<seq>` (or the standard `Last-Event-ID` header).
- Subscribers each get their own queue; slow consumers drop oldest events
  instead of blocking the pipeline.
"""

import asyncio
import json
import threading
from collections import deque

from app.services.common import iso, utcnow


class EventBroker:
    def __init__(self, history_size: int = 500, queue_size: int = 200):
        self._lock = threading.Lock()
        self._history = deque(maxlen=history_size)
        self._subscribers = []
        self._seq = 0
        self.loop: asyncio.AbstractEventLoop | None = None
        self.queue_size = queue_size
        self.last_event_at = None
        self.total_published = 0

    # -- publishing --------------------------------------------------------
    def publish(self, event_type: str, data) -> dict:
        with self._lock:
            self._seq += 1
            event = {
                "seq": self._seq,
                "type": event_type,
                "data": data,
                "ts": iso(utcnow()),
            }
            self._history.append(event)
            self.last_event_at = event["ts"]
            self.total_published += 1
            subscribers = list(self._subscribers)

        loop = self.loop
        if loop is not None and loop.is_running():
            for queue in subscribers:
                loop.call_soon_threadsafe(_try_put, queue, event)
        return event

    # -- subscribing -------------------------------------------------------
    def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=self.queue_size)
        with self._lock:
            self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        with self._lock:
            try:
                self._subscribers.remove(queue)
            except ValueError:
                pass

    def history_since(self, since=None) -> list:
        if since is None:
            return []
        try:
            since = int(since)
        except (TypeError, ValueError):
            return []
        with self._lock:
            return [ev for ev in self._history if ev["seq"] > since]

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)


def _try_put(queue: asyncio.Queue, event: dict) -> None:
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass


def sse_format(event: dict) -> str:
    body = json.dumps(
        {"type": event["type"], "data": event["data"], "ts": event["ts"]},
        default=str,
    )
    return f"id: {event['seq']}\nevent: {event['type']}\ndata: {body}\n\n"


broker = EventBroker()

import asyncio
from typing import List, Dict
from fastapi import WebSocket, WebSocketDisconnect
import json
import logging

logger = logging.getLogger("WebSocketManager")

class ConnectionManager:
    def __init__(self):
        # Active connections: {client_id: websocket}
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client {client_id} disconnected. Total clients: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json(message)

    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        if not self.active_connections:
            return

        # Create a list of tasks to send concurrently
        tasks = [
            websocket.send_json(message)
            for client_id, websocket in self.active_connections.items()
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

# Singleton instance
manager = ConnectionManager()

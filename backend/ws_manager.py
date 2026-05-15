"""
Mimir — WebSocket Connection Manager
Module-level singleton that tracks active WS connections by user_id.
Both chat.py (to register/deregister) and scheduler.py (to notify) import this.
"""

import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger("mimir.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, list[WebSocket]] = defaultdict(list)

    def connect(self, user_id: int, ws: WebSocket) -> None:
        self._connections[user_id].append(ws)
        logger.debug("[WS] user %d connected (%d sockets)", user_id, len(self._connections[user_id]))

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        self._connections[user_id] = [
            w for w in self._connections[user_id] if w is not ws
        ]

    async def send_to_user(self, user_id: int, data: dict) -> None:
        """Send a JSON message to all open connections for user_id."""
        payload = json.dumps(data)
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(user_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)


# Module-level singleton — import `manager` everywhere
manager = ConnectionManager()

"""Pydantic schemas for Terminal streaming endpoints (WS-2.16).

SSE-based terminal streaming: terminalOpen returns { session_id, stream_url },
client opens EventSource to stream_url for server→client chunks,
POST /terminal/{session_id}/write for client→server.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class TerminalWriteRequest(BaseModel):
    data: str

    model_config = ConfigDict(from_attributes=True)


class TerminalOpenResult(BaseModel):
    session_id: str
    stream_url: str

    model_config = ConfigDict(from_attributes=True)


class TerminalChunk(BaseModel):
    session_id: str
    data: str  # base64-encoded chunk
    closed: bool
    exit_status: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class TerminalActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)

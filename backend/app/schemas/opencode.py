"""Pydantic schemas for Hermes sidecar endpoints (WS-2.17).

Sidecar manages child process spawning/communication (child process management,
stdio IPC). Endpoints: start/stop/status, new_session, send_message,
get_history, abort.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class OpencodeStatus(BaseModel):
    running: bool
    port: Optional[int] = None
    pid: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "tool" | "system"
    text: str

    model_config = ConfigDict(from_attributes=True)


class OpencodeSessionResult(BaseModel):
    session_id: str

    model_config = ConfigDict(from_attributes=True)


class OpencodeMessageRequest(BaseModel):
    message: str
    agent: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OpencodeAbortResult(BaseModel):
    aborted: bool

    model_config = ConfigDict(from_attributes=True)

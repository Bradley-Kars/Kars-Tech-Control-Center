"""Hermes sidecar endpoints (WS-2.17).

Sidecar spawns/communicates with `hermes serve` child process via stdio IPC.

POST /hermes/start|stop, GET /hermes/status,
POST /hermes/sessions, POST/GET/POST /hermes/sessions/{id}/* (message, history, abort)
"""

from typing import Any, Optional

from fastapi import APIRouter, HTTPException

from app.crud.opencode import (
    opencode_abort,
    opencode_get_history,
    opencode_new_session,
    opencode_send_message,
    opencode_start,
    opencode_status,
    opencode_stop,
)
from app.schemas.opencode import (
    ChatMessage,
    OpencodeAbortResult,
    OpencodeMessageRequest,
    OpencodeSessionResult,
    OpencodeStatus,
)

router = APIRouter()


@router.post("/hermes/start", response_model=OpencodeStatus)
async def hermes_start_endpoint() -> Any:
    """Start Hermes sidecar."""
    return await opencode_start()


@router.post("/hermes/stop", response_model=OpencodeStatus)
async def hermes_stop_endpoint() -> Any:
    """Stop Hermes sidecar."""
    return await opencode_stop()


@router.get("/hermes/status", response_model=OpencodeStatus)
async def hermes_status_endpoint() -> Any:
    """Get Hermes sidecar status."""
    return await opencode_status()


@router.post("/hermes/sessions", response_model=OpencodeSessionResult)
async def hermes_new_session_endpoint(title: Optional[str] = None) -> Any:
    """Create a new Hermes sidecar session."""
    session_id = await opencode_new_session(title)
    return {"session_id": session_id}


@router.post("/hermes/sessions/{session_id}/message", response_model=list[ChatMessage])
async def hermes_send_message_endpoint(
    session_id: str, write_req: OpencodeMessageRequest
) -> Any:
    """Send a message to the Hermes sidecar."""
    try:
        return await opencode_send_message(session_id, write_req.message, write_req.agent)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/hermes/sessions/{session_id}/history", response_model=list[ChatMessage])
async def hermes_get_history_endpoint(session_id: str) -> Any:
    """Get Hermes sidecar session history."""
    try:
        return await opencode_get_history(session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/hermes/sessions/{session_id}/abort", response_model=OpencodeAbortResult)
async def hermes_abort_endpoint(session_id: str) -> Any:
    """Abort a Hermes sidecar session."""
    aborted = await opencode_abort(session_id)
    return {"aborted": aborted}

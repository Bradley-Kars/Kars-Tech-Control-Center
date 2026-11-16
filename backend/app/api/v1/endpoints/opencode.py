"""Hermes sidecar endpoints (WS-2.17).

Sidecar spawns/communicates with `hermes serve` child process via stdio IPC.

POST /opencode/start|stop, GET /opencode/status,
POST /opencode/sessions, POST/GET/POST /opencode/sessions/{id}/* (message, history, abort)
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


@router.post("/opencode/start", response_model=OpencodeStatus)
async def opencode_start_endpoint() -> Any:
    """Start Hermes sidecar (formerly Tauri `opencode_start`)."""
    return await opencode_start()


@router.post("/opencode/stop", response_model=OpencodeStatus)
async def opencode_stop_endpoint() -> Any:
    """Stop Hermes sidecar (formerly Tauri `opencode_stop`)."""
    return await opencode_stop()


@router.get("/opencode/status", response_model=OpencodeStatus)
async def opencode_status_endpoint() -> Any:
    """Get Hermes sidecar status (formerly Tauri `opencode_status`)."""
    return await opencode_status()


@router.post("/opencode/sessions", response_model=OpencodeSessionResult)
async def opencode_new_session_endpoint(title: Optional[str] = None) -> Any:
    """Create a new sidecar session (formerly Tauri `opencodeNewSession`)."""
    session_id = await opencode_new_session(title)
    return {"session_id": session_id}


@router.post("/opencode/sessions/{session_id}/message", response_model=list[ChatMessage])
async def opencode_send_message_endpoint(
    session_id: str, write_req: OpencodeMessageRequest
) -> Any:
    """Send a message to the sidecar (formerly Tauri `opencodeSendMessage`)."""
    try:
        return await opencode_send_message(session_id, write_req.message, write_req.agent)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/opencode/sessions/{session_id}/history", response_model=list[ChatMessage])
async def opencode_get_history_endpoint(session_id: str) -> Any:
    """Get sidecar session history (formerly Tauri `opencodeGetHistory`)."""
    try:
        return await opencode_get_history(session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/opencode/sessions/{session_id}/abort", response_model=OpencodeAbortResult)
async def opencode_abort_endpoint(session_id: str) -> Any:
    """Abort a sidecar session (formerly Tauri `opencodeAbort`)."""
    aborted = await opencode_abort(session_id)
    return {"aborted": aborted}

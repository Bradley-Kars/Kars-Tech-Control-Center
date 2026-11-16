"""Terminal streaming endpoints (WS-2.16).

SSE-based streaming per SPEC.md:
- POST /terminal/open → { session_id, stream_url }
- GET /terminal/{session_id}/stream → SSE event stream of TerminalChunk
- POST /terminal/{session_id}/write → client→server input
- POST /terminal/{session_id}/resize → resize PTY
- DELETE /terminal/{session_id} → close session

stream_url = /terminal/{session_id}/stream
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.crud.terminal import (
    terminal_close,
    terminal_get,
    terminal_open,
    terminal_resize,
    terminal_write,
)
from app.schemas.terminal import (
    TerminalActionResult,
    TerminalChunk,
    TerminalOpenResult,
    TerminalWriteRequest,
)

router = APIRouter()


@router.post("/terminal/open", response_model=TerminalOpenResult)
async def terminal_open_endpoint(
    cols: int = 80,
    rows: int = 24,
    server_id: str = "local",
) -> Any:
    """Open a terminal session (formerly Tauri `terminalOpen`).

    Returns { session_id, stream_url }; client opens EventSource to stream_url
    for server→client chunk streaming (replaces Tauri Channel<TerminalChunk>).
    """
    import uuid

    session_id = f"term-{uuid.uuid4().hex[:8]}"
    session = await terminal_open(session_id, cols, rows)
    return {
        "session_id": session.session_id,
        "stream_url": f"/terminal/{session.session_id}/stream",
    }


@router.get("/terminal/{session_id}/stream")
async def terminal_stream_endpoint(session_id: str) -> Any:
    """SSE stream of terminal chunks for a session."""
    session = await terminal_get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Terminal session not found")

    async def event_publisher():
        while True:
            chunk = await session.queue.get()
            if chunk is None:
                # session closed
                yield {
                    "event": "message",
                    "data": TerminalChunk(
                        session_id=session_id,
                        data="",
                        closed=True,
                        exit_status=session.exit_status,
                    ).model_dump_json(),
                }
                break
            yield {
                "event": "message",
                "data": TerminalChunk(
                    session_id=session_id,
                    data=chunk["data"],
                    closed=chunk.get("closed", False),
                ).model_dump_json(),
            }

    return EventSourceResponse(event_publisher())


@router.post("/terminal/{session_id}/write", response_model=TerminalActionResult)
async def terminal_write_endpoint(
    session_id: str, write_req: TerminalWriteRequest
) -> Any:
    """Send input to terminal session (formerly Tauri `terminalWrite`)."""
    session = await terminal_get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Terminal session not found")
    await terminal_write(session_id, write_req.data)
    return {"message": f"wrote {len(write_req.data)} bytes to session {session_id}"}


@router.post("/terminal/{session_id}/resize", response_model=TerminalActionResult)
async def terminal_resize_endpoint(
    session_id: str, cols: int, rows: int
) -> Any:
    """Resize terminal session PTY (formerly Tauri `terminalResize`)."""
    session = await terminal_get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Terminal session not found")
    await terminal_resize(session_id, cols, rows)
    return {"message": f"resized session {session_id} to {cols}x{rows}"}


@router.delete("/terminal/{session_id}", response_model=TerminalActionResult)
async def terminal_close_endpoint(session_id: str) -> Any:
    """Close terminal session (formerly Tauri `terminalClose`)."""
    session = await terminal_get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Terminal session not found")
    await terminal_close(session_id)
    return {"message": f"closed session {session_id}"}

"""Servers CRUD endpoints (WS-2.1).

GET/POST /servers, GET/DELETE /servers/{id}
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.crud.servers import (
    create_server,
    delete_server,
    get_server,
    get_servers,
    update_server,
)
from app.schemas.servers import ServerCreate, ServerOut, ServerUpdate

router = APIRouter()


@router.post("/servers", response_model=ServerOut)
async def save_server(
    server_in: ServerCreate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Create a server (formerly Tauri `save_server`).

    Flattens the nested `auth` dict (Password/Key variants) into the
    flattened `auth_type`/`auth_password`/`auth_key_path`/`auth_passphrase`
    columns per SPEC.md schema design.
    """
    payload = server_in.model_dump()
    auth = payload.pop("auth", {}) or {}
    auth_type = auth.get("type", "password")
    payload["auth_type"] = auth_type
    if auth_type == "password":
        payload["auth_password"] = auth.get("password")
        payload["auth_key_path"] = None
        payload["auth_passphrase"] = None
    else:
        payload["auth_password"] = None
        payload["auth_key_path"] = auth.get("key_path")
        payload["auth_passphrase"] = auth.get("passphrase")
    db_server = await create_server(db, payload)
    return db_server


@router.get("/servers", response_model=list[ServerOut])
async def get_servers_list(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """List servers (formerly Tauri `get_servers`)."""
    return await get_servers(db, skip=skip, limit=limit)


@router.get("/servers/{server_id}", response_model=ServerOut)
async def get_server_endpoint(
    server_id: str,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Get one server by id."""
    db_server = await get_server(db, server_id)
    if not db_server:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server


@router.delete("/servers/{server_id}", response_model=ServerOut)
async def remove_server(
    server_id: str,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Delete a server (formerly Tauri `remove_server`)."""
    db_server = await delete_server(db, server_id)
    if not db_server:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server


@router.patch("/servers/{server_id}", response_model=ServerOut)
async def update_server_endpoint(
    server_id: str,
    server_in: ServerUpdate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Update a server."""
    payload = server_in.model_dump(exclude_unset=True)
    db_server = await update_server(db, server_id, payload)
    if not db_server:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server

"""Pydantic schemas for Lidarr endpoints (WS-2.5)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class LidarrSystemStatus(BaseModel):
    version: Optional[str] = None
    startupPath: Optional[str] = None
    osName: Optional[str] = None
    osVersion: Optional[str] = None
    isDebug: Optional[bool] = None
    isAdmin: Optional[bool] = None
    osArchitecture: Optional[str] = None
    applicationUrl: Optional[str] = None
    authentication: Optional[str] = None
    startupTime: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class LidarrArtist(BaseModel):
    id: Optional[int] = None
    artistName: Optional[str] = None
    foreignArtistId: Optional[str] = None
    profileImage: Optional[str] = None
    qualityProfileId: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class LidarrAlbum(BaseModel):
    id: Optional[int] = None
    title: Optional[str] = None
    artistId: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class LidarrActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)

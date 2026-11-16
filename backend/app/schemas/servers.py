"""Pydantic schemas for servers (WS-2.1)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_serializer


class AuthPassword(BaseModel):
    type: str = "password"
    password: str


class AuthKey(BaseModel):
    type: str = "key"
    key_path: str
    passphrase: Optional[str] = None


class ServerBase(BaseModel):
    name: str
    hostname: str
    port: int = 22
    username: str = "root"
    device_type: str = "unraid"
    api_key: Optional[str] = None
    service_keys: dict[str, Any] = {}
    meshcentral_device_id: Optional[str] = None
    meshcentral_enrolled_at: Optional[str] = None
    meshcentral_status: Optional[str] = None
    connection_priority: Optional[list[str]] = None


class ServerCreate(ServerBase):
    id: str
    auth: dict[str, Any]


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    auth: Optional[dict[str, Any]] = None
    device_type: Optional[str] = None
    api_key: Optional[str] = None
    service_keys: Optional[dict[str, Any]] = None
    meshcentral_device_id: Optional[str] = None
    meshcentral_enrolled_at: Optional[str] = None
    meshcentral_status: Optional[str] = None
    connection_priority: Optional[list[str]] = None


class ServerOut(ServerBase):
    id: str
    auth_type: Optional[str] = None
    auth_password: Optional[str] = None
    auth_key_path: Optional[str] = None
    auth_passphrase: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_serializer
    def ser_model(self) -> dict[str, Any]:
        data = {
            "id": self.id,
            "name": self.name,
            "hostname": self.hostname,
            "port": self.port,
            "username": self.username,
            "device_type": self.device_type,
            "api_key": self.api_key,
            "service_keys": self.service_keys,
            "meshcentral_device_id": self.meshcentral_device_id,
            "meshcentral_enrolled_at": self.meshcentral_enrolled_at,
            "meshcentral_status": self.meshcentral_status,
            "connection_priority": self.connection_priority,
        }
        if self.auth_type == "key":
            data["auth"] = {
                "type": "key",
                "key_path": self.auth_key_path,
                "passphrase": self.auth_passphrase,
            }
        else:
            data["auth"] = {
                "type": "password",
                "password": self.auth_password,
            }
        return data

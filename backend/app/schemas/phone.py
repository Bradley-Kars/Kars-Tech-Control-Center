"""Pydantic schemas for Phone endpoints (WS-2.9)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class PhoneDeviceInfo(BaseModel):
    id: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    androidVersion: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneBattery(BaseModel):
    level: Optional[int] = None
    isCharging: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneThermal(BaseModel):
    temperature: Optional[float] = None
    throttling: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneStorage(BaseModel):
    total: Optional[int] = None
    used: Optional[int] = None
    free: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneMemory(BaseModel):
    total: Optional[int] = None
    used: Optional[int] = None
    free: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneCpu(BaseModel):
    usage: Optional[float] = None
    cores: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneScreen(BaseModel):
    on: Optional[bool] = None
    brightness: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneNetwork(BaseModel):
    wifi: Optional[bool] = None
    mobile: Optional[bool] = None
    ipAddress: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneApp(BaseModel):
    packageName: Optional[str] = None
    appName: Optional[str] = None
    version: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneProcess(BaseModel):
    pid: Optional[int] = None
    name: Optional[str] = None
    cpu: Optional[float] = None
    memory: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class PhoneActivity(BaseModel):
    screenOn: Optional[bool] = None
    lastActivity: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ContactInfo(BaseModel):
    id: Optional[int] = None
    displayName: Optional[str] = None
    phoneNumbers: list[str] = []
    emails: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class CallLogEntry(BaseModel):
    id: Optional[int] = None
    number: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    date: Optional[int] = None
    duration: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SmsMessage(BaseModel):
    id: Optional[int] = None
    address: Optional[str] = None
    body: Optional[str] = None
    date: Optional[int] = None
    read: Optional[bool] = None
    type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SmsConversation(BaseModel):
    address: Optional[str] = None
    contactName: Optional[str] = None
    lastMessage: Optional[str] = None
    lastTimestamp: Optional[int] = None
    unreadCount: Optional[int] = 0
    messageCount: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class PhoneActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)

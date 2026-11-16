"""Phone endpoints (WS-2.9).

GET/POST /phone/{id}/* (device-info, battery, thermal, storage, memory, cpu,
screen, network, apps, processes, activity, contacts, call-log,
set-screen, set-brightness, set-auto-brightness, volume-up/down, reboot,
screenshot, screenshot-save, force-stop-app, sms/inbox|by-address|conversations|send,
launch-rustdesk)

Includes parity gap G3: get_phone_contacts.
"""

from typing import Any, Optional

from fastapi import APIRouter

from app.crud.phone import (
    get_phone_activity,
    get_phone_apps,
    get_phone_battery,
    get_phone_call_log,
    get_phone_contacts,
    get_phone_cpu,
    get_phone_device_info,
    get_phone_memory,
    get_phone_network,
    get_phone_processes,
    get_phone_screen,
    phone_get_sms_inbox,
    get_phone_storage,
    get_phone_thermal,
    phone_force_stop_app,
    phone_get_sms_by_address,
    phone_get_sms_conversations,
    phone_reboot,
    phone_screenshot,
    phone_screenshot_save,
    phone_send_sms,
    phone_set_auto_brightness,
    phone_set_brightness,
    phone_set_screen,
    phone_volume_down,
    phone_volume_up,
    phone_launch_rustdesk,
)
from app.schemas.phone import (
    CallLogEntry,
    ContactInfo,
    PhoneActionResult,
    PhoneActivity,
    PhoneApp,
    PhoneBattery,
    PhoneCpu,
    PhoneDeviceInfo,
    PhoneMemory,
    PhoneNetwork,
    PhoneProcess,
    PhoneScreen,
    PhoneStorage,
    PhoneThermal,
    SmsConversation,
    SmsMessage,
)

router = APIRouter()


@router.get("/phone/{device_id}/device-info", response_model=PhoneDeviceInfo)
async def get_phone_device_info_endpoint(device_id: str) -> Any:
    """Get phone device info (formerly Tauri `get_phone_device_info`)."""
    return await get_phone_device_info(device_id)


@router.get("/phone/{device_id}/battery", response_model=PhoneBattery)
async def get_phone_battery_endpoint(device_id: str) -> Any:
    """Get phone battery (formerly Tauri `get_phone_battery`)."""
    return await get_phone_battery(device_id)


@router.get("/phone/{device_id}/thermal", response_model=PhoneThermal)
async def get_phone_thermal_endpoint(device_id: str) -> Any:
    """Get phone thermal (formerly Tauri `get_phone_thermal`)."""
    return await get_phone_thermal(device_id)


@router.get("/phone/{device_id}/storage", response_model=PhoneStorage)
async def get_phone_storage_endpoint(device_id: str) -> Any:
    """Get phone storage (formerly Tauri `get_phone_storage`)."""
    return await get_phone_storage(device_id)


@router.get("/phone/{device_id}/memory", response_model=PhoneMemory)
async def get_phone_memory_endpoint(device_id: str) -> Any:
    """Get phone memory (formerly Tauri `get_phone_memory`)."""
    return await get_phone_memory(device_id)


@router.get("/phone/{device_id}/cpu", response_model=PhoneCpu)
async def get_phone_cpu_endpoint(device_id: str) -> Any:
    """Get phone CPU (formerly Tauri `get_phone_cpu`)."""
    return await get_phone_cpu(device_id)


@router.get("/phone/{device_id}/screen", response_model=PhoneScreen)
async def get_phone_screen_endpoint(device_id: str) -> Any:
    """Get phone screen state (formerly Tauri `get_phone_screen`)."""
    return await get_phone_screen(device_id)


@router.get("/phone/{device_id}/network", response_model=PhoneNetwork)
async def get_phone_network_endpoint(device_id: str) -> Any:
    """Get phone network (formerly Tauri `get_phone_network`)."""
    return await get_phone_network(device_id)


@router.get("/phone/{device_id}/apps", response_model=list[PhoneApp])
async def get_phone_apps_endpoint(device_id: str) -> Any:
    """List phone apps (formerly Tauri `get_phone_apps`)."""
    return await get_phone_apps(device_id)


@router.get("/phone/{device_id}/processes", response_model=list[PhoneProcess])
async def get_phone_processes_endpoint(device_id: str) -> Any:
    """List phone processes (formerly Tauri `get_phone_processes`)."""
    return await get_phone_processes(device_id)


@router.get("/phone/{device_id}/activity", response_model=PhoneActivity)
async def get_phone_activity_endpoint(device_id: str) -> Any:
    """Get phone activity (formerly Tauri `get_phone_activity`)."""
    return await get_phone_activity(device_id)


@router.get("/phone/{device_id}/contacts", response_model=list[ContactInfo])
async def get_phone_contacts_endpoint(device_id: str) -> Any:
    """Get phone contacts — parity gap G3 (formerly Tauri `get_phone_contacts`)."""
    return await get_phone_contacts(device_id)


@router.get("/phone/{device_id}/call-log", response_model=list[CallLogEntry])
async def get_phone_call_log_endpoint(device_id: str) -> Any:
    """Get phone call log (formerly Tauri `phoneGetCallLog`)."""
    return await get_phone_call_log(device_id)


@router.post("/phone/{device_id}/screen", response_model=PhoneActionResult)
async def phone_set_screen_endpoint(device_id: str, on: bool) -> Any:
    """Set phone screen (formerly Tauri `phoneSetScreen`)."""
    return await phone_set_screen(device_id, on)


@router.post("/phone/{device_id}/brightness", response_model=PhoneActionResult)
async def phone_set_brightness_endpoint(device_id: str, value: int) -> Any:
    """Set phone brightness (formerly Tauri `phoneSetBrightness`)."""
    return await phone_set_brightness(device_id, value)


@router.post("/phone/{device_id}/auto-brightness", response_model=PhoneActionResult)
async def phone_set_auto_brightness_endpoint(device_id: str, enabled: bool) -> Any:
    """Set phone auto brightness (formerly Tauri `phoneSetAutoBrightness`)."""
    return await phone_set_auto_brightness(device_id, enabled)


@router.post("/phone/{device_id}/volume/up", response_model=PhoneActionResult)
async def phone_volume_up_endpoint(device_id: str) -> Any:
    """Phone volume up (formerly Tauri `phoneVolumeUp`)."""
    return await phone_volume_up(device_id)


@router.post("/phone/{device_id}/volume/down", response_model=PhoneActionResult)
async def phone_volume_down_endpoint(device_id: str) -> Any:
    """Phone volume down (formerly Tauri `phoneVolumeDown`)."""
    return await phone_volume_down(device_id)


@router.post("/phone/{device_id}/reboot", response_model=PhoneActionResult)
async def phone_reboot_endpoint(device_id: str) -> Any:
    """Reboot phone (formerly Tauri `phoneReboot`)."""
    return await phone_reboot(device_id)


@router.get("/phone/{device_id}/screenshot")
async def phone_screenshot_endpoint(device_id: str) -> Any:
    """Phone screenshot (formerly Tauri `phoneScreenshot`)."""
    return await phone_screenshot(device_id)


@router.post("/phone/{device_id}/screenshot/save")
async def phone_screenshot_save_endpoint(device_id: str) -> Any:
    """Save phone screenshot (formerly Tauri `phoneScreenshotSave`)."""
    return await phone_screenshot_save(device_id)


@router.post("/phone/{device_id}/apps/{package}/force-stop", response_model=PhoneActionResult)
async def phone_force_stop_app_endpoint(device_id: str, package: str) -> Any:
    """Force stop phone app (formerly Tauri `phoneForceStopApp`)."""
    return await phone_force_stop_app(device_id, package)


@router.get("/phone/{device_id}/sms/inbox", response_model=list[SmsMessage])
async def phone_get_sms_inbox_endpoint(
    device_id: str, limit: Optional[int] = None
) -> Any:
    """Get phone SMS inbox (formerly Tauri `phoneGetSmsInbox`)."""
    return await phone_get_sms_inbox(device_id, limit)


@router.get("/phone/{device_id}/sms/by-address", response_model=list[SmsMessage])
async def phone_get_sms_by_address_endpoint(
    device_id: str, address: str
) -> Any:
    """Get phone SMS by address (formerly Tauri `phoneGetSmsByAddress`)."""
    return await phone_get_sms_by_address(device_id, address)


@router.get("/phone/{device_id}/sms/conversations", response_model=list[SmsConversation])
async def phone_get_sms_conversations_endpoint(device_id: str) -> Any:
    """Get phone SMS conversations (formerly Tauri `phoneGetSmsConversations`)."""
    return await phone_get_sms_conversations(device_id)


@router.post("/phone/{device_id}/sms/send", response_model=PhoneActionResult)
async def phone_send_sms_endpoint(
    device_id: str, address: str, body: str
) -> Any:
    """Send phone SMS (formerly Tauri `phoneSendSms`)."""
    return await phone_send_sms(device_id, address, body)


@router.post("/phone/{device_id}/rustdesk/launch", response_model=PhoneActionResult)
async def phone_launch_rustdesk_endpoint(device_id: str) -> Any:
    """Launch RustDesk on phone (formerly Tauri `launchRustdesk`)."""
    return await phone_launch_rustdesk(device_id)

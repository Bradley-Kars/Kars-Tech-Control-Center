use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectConfig {
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectBattery {
    pub charge: u32,
    pub is_charging: bool,
    pub has_battery: bool,
    pub icon_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectNotification {
    pub id: String,
    pub app_name: String,
    pub title: String,
    pub text: String,
    pub icon_name: Option<String>,
    pub urgency: Option<String>,
    pub timestamp: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectMprisStatus {
    pub player: String,
    pub player_list: Vec<String>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub is_playing: bool,
    pub can_seek: bool,
    pub volume: f64,
    pub position: i64,
    pub length: i64,
    pub local_album_art_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectConnectivity {
    pub cellular_network_strength: i32,
    pub cellular_network_type: String,
    pub icon_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectTelephony {
    pub is_ringing: bool,
    pub is_active: bool,
    pub number: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectContact {
    pub uid: String,
    pub name: String,
    pub phone_numbers: Vec<String>,
    pub emails: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectDeviceInfo {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub is_paired: bool,
    pub is_reachable: bool,
    pub icon_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectConversation {
    pub thread_id: i64,
    pub address: String,
    pub body: String,
    pub date: i64,
    pub read: bool,
    pub message_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdeConnectFile {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub mime_type: Option<String>,
}

pub struct KdeConnectClient {
    config: KdeConnectConfig,
}

impl KdeConnectClient {
    pub fn new(config: KdeConnectConfig) -> Result<Self> {
        Ok(Self { config })
    }

    pub async fn get_battery(&self) -> Result<KdeConnectBattery> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/battery",
            self.config.device_id
        );
        let json = tokio::task::spawn_blocking({
            let path = path.clone();
            move || Self::run_gdbus_get_all_static(&path, "org.kde.kdeconnect.device.battery")
        })
        .await
        .context("gdbus task failed")??;

        Ok(KdeConnectBattery {
            charge: json.get("charge").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            is_charging: json
                .get("isCharging")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            has_battery: json
                .get("hasBattery")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            icon_name: json
                .get("iconName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }

    pub async fn get_active_notifications(&self) -> Result<Vec<KdeConnectNotification>> {
        let ids = {
            let path = format!(
                "/modules/kdeconnect/devices/{}/notifications",
                self.config.device_id
            );
            let json = tokio::task::spawn_blocking({
                let path = path.clone();
                move || {
                    Self::run_gdbus_call_method_static(
                        &path,
                        "org.kde.kdeconnect.device.notifications",
                        "activeNotifications",
                        &[],
                    )
                }
            })
            .await
            .context("gdbus task failed")??;

            if let Some(arr) = json.as_array() {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            } else {
                return Ok(Vec::new());
            }
        };

        let mut notifications = Vec::new();
        for id in ids {
            match self.get_notification(&id).await {
                Ok(n) => notifications.push(n),
                Err(e) => {
                    eprintln!("Failed to fetch notification {}: {}", id, e);
                    notifications.push(KdeConnectNotification {
                        id: id.clone(),
                        app_name: String::new(),
                        title: format!("Notification #{}", id),
                        text: String::new(),
                        icon_name: None,
                        urgency: None,
                        timestamp: None,
                    });
                }
            }
        }
        Ok(notifications)
    }

    pub async fn get_notification(&self, id: &str) -> Result<KdeConnectNotification> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/notifications/{}",
            self.config.device_id, id
        );
        let json = tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_get_all_static(
                    &path,
                    "org.kde.kdeconnect.device.notifications.notification",
                )
            }
        })
        .await
        .context("gdbus task failed")??;

        Ok(KdeConnectNotification {
            id: id.to_string(),
            app_name: json
                .get("appName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            title: json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            text: json
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            icon_name: json
                .get("iconName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            urgency: json
                .get("urgency")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            timestamp: json.get("timestamp").and_then(|v| v.as_u64()),
        })
    }

    pub async fn get_mpris_status(&self) -> Result<KdeConnectMprisStatus> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/mprisremote",
            self.config.device_id
        );
        let json = tokio::task::spawn_blocking({
            let path = path.clone();
            move || Self::run_gdbus_get_all_static(&path, "org.kde.kdeconnect.device.mpris")
        })
        .await
        .context("gdbus task failed")??;

        let player_list = json
            .get("playerList")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        Ok(KdeConnectMprisStatus {
            player: json
                .get("player")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            player_list,
            title: json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            artist: json
                .get("artist")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            album: json
                .get("album")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            is_playing: json
                .get("isPlaying")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            can_seek: json
                .get("canSeek")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            volume: json.get("volume").and_then(|v| v.as_f64()).unwrap_or(0.0),
            position: json.get("position").and_then(|v| v.as_i64()).unwrap_or(0),
            length: json.get("length").and_then(|v| v.as_i64()).unwrap_or(0),
            local_album_art_url: json
                .get("localAlbumArtUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }

    pub async fn mpris_play(&self) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/mprisremote",
            self.config.device_id
        );
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.mpris",
                    "play",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn mpris_pause(&self) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/mprisremote",
            self.config.device_id
        );
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.mpris",
                    "pause",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn mpris_play_pause(&self) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/mprisremote",
            self.config.device_id
        );
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.mpris",
                    "playPause",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn mpris_next(&self) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/mprisremote",
            self.config.device_id
        );
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.mpris",
                    "next",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn mpris_previous(&self) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/mprisremote",
            self.config.device_id
        );
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.mpris",
                    "previous",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn mpris_set_volume(&self, volume: f64) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/mprisremote",
            self.config.device_id
        );
        let vol_str = volume.to_string();
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.mpris",
                    "setVolume",
                    &[&vol_str],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn get_connectivity(&self) -> Result<KdeConnectConnectivity> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/connectivity_report",
            self.config.device_id
        );
        let json = tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_get_all_static(
                    &path,
                    "org.kde.kdeconnect.device.connectivity_report",
                )
            }
        })
        .await
        .context("gdbus task failed")??;

        Ok(KdeConnectConnectivity {
            cellular_network_strength: json
                .get("cellularNetworkStrength")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32,
            cellular_network_type: json
                .get("cellularNetworkType")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            icon_name: json
                .get("iconName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }

    pub async fn get_telephony(&self) -> Result<KdeConnectTelephony> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/telephony",
            self.config.device_id
        );
        let json = tokio::task::spawn_blocking({
            let path = path.clone();
            move || Self::run_gdbus_get_all_static(&path, "org.kde.kdeconnect.device.telephony")
        })
        .await
        .context("gdbus task failed")??;

        Ok(KdeConnectTelephony {
            is_ringing: json
                .get("isRinging")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            is_active: json
                .get("isActive")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            number: json
                .get("number")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            name: json
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        })
    }

    pub async fn ring_device(&self) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/findmyphone",
            self.config.device_id
        );
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.findmyphone",
                    "ring",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn send_ping(&self, message: &str) -> Result<()> {
        let path = format!("/modules/kdeconnect/devices/{}/ping", self.config.device_id);
        let msg = message.to_string();
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.ping",
                    "sendPing",
                    &[&msg],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn send_sms(&self, number: &str, message: &str) -> Result<()> {
        let path = format!("/modules/kdeconnect/devices/{}/sms", self.config.device_id);
        // avsv signature: (array-of-variant, string, array-of-variant)
        // gdbus parses args as GVariant text: dict keys/strings need single quotes,
        // variant values use <...>, and quotes/backslashes must be escaped.
        let number = number.replace('\\', "\\\\").replace('\'', "\\'");
        let message = message.replace('\\', "\\\\").replace('\'', "\\'");
        let arg1 = format!(
            "@a{{sv}} [{{'type': <'system'>, 'number': <'{}'>}}]",
            number
        );
        let arg2 = format!("'{}'", message);
        let arg3 = "@a{sv} []".to_string();
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.sms",
                    "sendSms",
                    &[&arg1, &arg2, &arg3],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    /// List all KDE Connect devices
    pub async fn list_devices(&self) -> Result<Vec<KdeConnectDeviceInfo>> {
        let json = tokio::task::spawn_blocking(|| {
            Self::run_gdbus_call_method_static(
                "/modules/kdeconnect",
                "org.kde.kdeconnect.daemon",
                "devices",
                &[],
            )
        })
        .await
        .context("gdbus task failed")??;

        let mut devices = Vec::new();
        if let Some(arr) = json.as_array() {
            for item in arr {
                if let Some(id) = item.as_str() {
                    // Get device details
                    let path = format!("/modules/kdeconnect/devices/{}", id);
                    if let Ok(info) = tokio::task::spawn_blocking({
                        let path = path.clone();
                        move || Self::run_gdbus_get_all_static(&path, "org.kde.kdeconnect.device")
                    })
                    .await
                    .unwrap_or(Err(anyhow::anyhow!("failed")))
                    {
                        devices.push(KdeConnectDeviceInfo {
                            id: id.to_string(),
                            name: info
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown")
                                .to_string(),
                            device_type: info
                                .get("type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string(),
                            is_paired: info
                                .get("isPaired")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                            is_reachable: info
                                .get("isReachable")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                            icon_name: info
                                .get("iconName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        });
                    }
                }
            }
        }
        Ok(devices)
    }

    /// Get active SMS conversations via KDE Connect conversations interface
    pub async fn get_conversations(&self) -> Result<Vec<KdeConnectConversation>> {
        let path = format!("/modules/kdeconnect/devices/{}", self.config.device_id);
        let json = tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.conversations",
                    "activeConversations",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;

        let mut conversations = Vec::new();
        if let Some(arr) = json.as_array() {
            for item in arr {
                // Each item is a variant containing a dict with thread info
                if let Some(dict) = item.get(0).or(Some(item)) {
                    let thread_id = dict
                        .get("thread_id")
                        .and_then(|v| v.as_i64())
                        .or_else(|| dict.get("0").and_then(|v| v.as_i64()))
                        .unwrap_or(0);
                    let address = dict
                        .get("address")
                        .and_then(|v| v.as_str())
                        .or_else(|| dict.get("1").and_then(|v| v.as_str()))
                        .unwrap_or("")
                        .to_string();
                    let body = dict
                        .get("body")
                        .and_then(|v| v.as_str())
                        .or_else(|| dict.get("2").and_then(|v| v.as_str()))
                        .unwrap_or("")
                        .to_string();
                    let date = dict
                        .get("date")
                        .and_then(|v| v.as_i64())
                        .or_else(|| dict.get("3").and_then(|v| v.as_i64()))
                        .unwrap_or(0);
                    let read = dict
                        .get("read")
                        .and_then(|v| v.as_bool())
                        .or_else(|| dict.get("4").and_then(|v| v.as_bool()))
                        .unwrap_or(true);
                    let message_count = dict
                        .get("message_count")
                        .and_then(|v| v.as_i64())
                        .or_else(|| dict.get("5").and_then(|v| v.as_i64()))
                        .unwrap_or(0) as i32;

                    conversations.push(KdeConnectConversation {
                        thread_id,
                        address,
                        body,
                        date,
                        read,
                        message_count,
                    });
                }
            }
        }
        Ok(conversations)
    }

    /// Reply to a conversation thread
    pub async fn reply_to_conversation(&self, thread_id: i64, message: &str) -> Result<()> {
        let path = format!("/modules/kdeconnect/devices/{}", self.config.device_id);
        // replyToConversation expects (thread_id: i64, message: string, attachments: array)
        let arg1 = thread_id.to_string();
        let arg2 = format!("\"{}\"", message);
        let arg3 = "[]".to_string();
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.conversations",
                    "replyToConversation",
                    &[&arg1, &arg2, &arg3],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    /// Request conversation messages for a specific thread
    pub async fn request_conversation(&self, thread_id: i64) -> Result<()> {
        let path = format!("/modules/kdeconnect/devices/{}", self.config.device_id);
        let arg1 = thread_id.to_string();
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.conversations",
                    "requestConversation",
                    &[&arg1],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn send_clipboard(&self, text: &str) -> Result<()> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/clipboard",
            self.config.device_id
        );
        let txt = text.to_string();
        tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.clipboard",
                    "sendClipboard",
                    &[&txt],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn get_clipboard(&self) -> Result<String> {
        let path = format!(
            "/modules/kdeconnect/devices/{}/clipboard",
            self.config.device_id
        );
        let json = tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.clipboard",
                    "getClipboard",
                    &[],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(json.as_str().unwrap_or("").to_string())
    }

    pub async fn get_contacts(&self) -> Result<Vec<KdeConnectContact>> {
        // KDE Connect contacts plugin uses synchronizeRemoteWithLocal() and delivers
        // contacts via D-Bus signals (localCacheSynchronized). This is async/push-based
        // and cannot be fetched on demand via a simple method call.
        // Trigger the sync and return empty - contacts arrive via signal.
        let path = format!(
            "/modules/kdeconnect/devices/{}/contacts",
            self.config.device_id
        );
        let _ = tokio::task::spawn_blocking({
            let path = path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &path,
                    "org.kde.kdeconnect.device.contacts",
                    "synchronizeRemoteWithLocal",
                    &[],
                )
            }
        })
        .await;

        // Return empty with a note - real contacts require D-Bus signal monitoring
        Ok(Vec::new())
    }

    pub async fn sftp_list_files(&self, path: &str) -> Result<Vec<KdeConnectFile>> {
        let device_path = format!("/modules/kdeconnect/devices/{}/sftp", self.config.device_id);
        let p = path.to_string();
        let json = tokio::task::spawn_blocking({
            let device_path = device_path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &device_path,
                    "org.kde.kdeconnect.device.sftp",
                    "listFiles",
                    &[&p],
                )
            }
        })
        .await
        .context("gdbus task failed")??;

        let mut files = Vec::new();
        if let Some(arr) = json.as_array() {
            for item in arr {
                if let Some(obj) = item.as_object() {
                    files.push(KdeConnectFile {
                        name: obj
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        path: obj
                            .get("path")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        is_dir: obj.get("isDir").and_then(|v| v.as_bool()).unwrap_or(false),
                        size: obj.get("size").and_then(|v| v.as_u64()),
                        mime_type: obj
                            .get("mimeType")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                    });
                }
            }
        }
        Ok(files)
    }

    pub async fn share_file(&self, path: &str) -> Result<()> {
        let device_path = format!(
            "/modules/kdeconnect/devices/{}/share",
            self.config.device_id
        );
        let p = path.to_string();
        tokio::task::spawn_blocking({
            let device_path = device_path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &device_path,
                    "org.kde.kdeconnect.device.share",
                    "shareFile",
                    &[&p],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn share_url(&self, url: &str) -> Result<()> {
        let device_path = format!(
            "/modules/kdeconnect/devices/{}/share",
            self.config.device_id
        );
        let u = url.to_string();
        tokio::task::spawn_blocking({
            let device_path = device_path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &device_path,
                    "org.kde.kdeconnect.device.share",
                    "shareUrl",
                    &[&u],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn share_text(&self, text: &str) -> Result<()> {
        let device_path = format!(
            "/modules/kdeconnect/devices/{}/share",
            self.config.device_id
        );
        let txt = text.to_string();
        tokio::task::spawn_blocking({
            let device_path = device_path.clone();
            move || {
                Self::run_gdbus_call_method_static(
                    &device_path,
                    "org.kde.kdeconnect.device.share",
                    "shareText",
                    &[&txt],
                )
            }
        })
        .await
        .context("gdbus task failed")??;
        Ok(())
    }

    pub async fn is_available(&self) -> bool {
        self.get_battery().await.is_ok()
    }

    // Static helper methods for spawn_blocking
    fn run_gdbus_get_all_static(path: &str, interface: &str) -> Result<serde_json::Value> {
        let output = Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.kde.kdeconnect",
                "--object-path",
                path,
                "--method",
                "org.freedesktop.DBus.Properties.GetAll",
                interface,
            ])
            .output()
            .context("Failed to execute gdbus")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("gdbus failed: {}", stderr);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_gdbus_dict(&stdout)
    }

    fn run_gdbus_call_method_static(
        path: &str,
        interface: &str,
        method: &str,
        args: &[&str],
    ) -> Result<serde_json::Value> {
        let mut cmd = Command::new("gdbus");
        cmd.args([
            "call",
            "--session",
            "--dest",
            "org.kde.kdeconnect",
            "--object-path",
            path,
            "--method",
            &format!("{}.{}", interface, method),
        ]);
        for arg in args {
            cmd.arg(arg);
        }

        let output = cmd.output().context("Failed to execute gdbus")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("gdbus failed: {}", stderr);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_gdbus_value(&stdout)
    }
}

fn parse_gdbus_dict(stdout: &str) -> Result<serde_json::Value> {
    let s = stdout.trim();
    if s.starts_with('(') && s.ends_with(')') {
        let inner = s[1..s.len() - 1].trim().trim_end_matches(',').trim();
        parse_gdbus_value(inner)
    } else {
        parse_gdbus_value(s)
    }
}

fn split_top_level(s: &str, sep: char) -> Vec<String> {
    let mut items = Vec::new();
    let mut depth = 0;
    let mut current = String::new();
    for c in s.chars() {
        match c {
            '{' | '[' | '(' | '<' => {
                depth += 1;
                current.push(c);
            }
            '}' | ']' | ')' | '>' => {
                depth -= 1;
                current.push(c);
            }
            c if c == sep && depth == 0 => {
                items.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(c),
        }
    }
    if !current.trim().is_empty() {
        items.push(current.trim().to_string());
    }
    items
}

fn parse_gdbus_value(s: &str) -> Result<serde_json::Value> {
    let s = s.trim();
    if s.is_empty() {
        return Ok(serde_json::Value::Null);
    }

    // Handle tuples: (a, b, ...) — strip outer parens and re-parse inner
    if s.starts_with('(') && s.ends_with(')') {
        let inner = s[1..s.len() - 1].trim();
        // Single-element tuple: unwrap
        let items = split_top_level(inner, ',');
        if items.len() == 1 {
            return parse_gdbus_value(&items[0]);
        }
        // Multi-element tuple: return as array
        let values: Result<Vec<_>> = items.iter().map(|item| parse_gdbus_value(item)).collect();
        return Ok(serde_json::Value::Array(values?));
    }

    // Handle variant wrappers: <value> — strip angle brackets and re-parse
    if s.starts_with('<') && s.ends_with('>') {
        let inner = s[1..s.len() - 1].trim();
        // Try to parse inner as a typed value first
        if let Ok(n) = inner.parse::<i64>() {
            return Ok(serde_json::Value::Number(n.into()));
        }
        if let Ok(n) = inner.parse::<u64>() {
            return Ok(serde_json::Value::Number(n.into()));
        }
        if let Ok(n) = inner.parse::<f64>() {
            return Ok(serde_json::Value::Number(
                serde_json::Number::from_f64(n).unwrap(),
            ));
        }
        if inner == "true" {
            return Ok(serde_json::Value::Bool(true));
        }
        if inner == "false" {
            return Ok(serde_json::Value::Bool(false));
        }
        // Re-parse the inner content (handles nested dicts, arrays, etc.)
        return parse_gdbus_value(inner);
    }

    // Handle strings (double or single quotes)
    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
        return Ok(serde_json::Value::String(s[1..s.len() - 1].to_string()));
    }

    // Handle arrays: [a, b, c] — depth-aware splitting
    if s.starts_with('[') && s.ends_with(']') {
        let inner = s[1..s.len() - 1].trim();
        if inner.is_empty() {
            return Ok(serde_json::Value::Array(vec![]));
        }
        let items = split_top_level(inner, ',');
        let values: Result<Vec<_>> = items.iter().map(|item| parse_gdbus_value(item)).collect();
        return Ok(serde_json::Value::Array(values?));
    }

    // Handle dictionaries: {key: value, ...} — already uses depth-aware splitting
    if s.starts_with('{') && s.ends_with('}') {
        let inner = s[1..s.len() - 1].trim();
        let mut map = serde_json::Map::new();
        if !inner.is_empty() {
            let pairs = split_top_level(inner, ',');
            for pair in pairs {
                if let Some((k, v)) = pair.split_once(':') {
                    let key = parse_gdbus_value(k.trim())?
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    let value = parse_gdbus_value(v.trim())?;
                    map.insert(key, value);
                }
            }
        }
        return Ok(serde_json::Value::Object(map));
    }

    // Fallback: return as string
    Ok(serde_json::Value::String(s.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_top_level_simple() {
        let items = split_top_level("a, b, c", ',');
        assert_eq!(items, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_split_top_level_nested() {
        let items = split_top_level("[1, 2], {a: 3}, <4>", ',');
        assert_eq!(items, vec!["[1, 2]", "{a: 3}", "<4>"]);
    }

    #[test]
    fn test_split_top_level_empty() {
        let items = split_top_level("", ',');
        assert!(items.is_empty());
    }

    #[test]
    fn test_parse_gdbus_value_string() {
        let v = parse_gdbus_value("'hello'").unwrap();
        assert_eq!(v, serde_json::Value::String("hello".to_string()));
    }

    #[test]
    fn test_parse_gdbus_value_number() {
        let v = parse_gdbus_value("<42>").unwrap();
        assert_eq!(v, serde_json::Value::Number(42.into()));
    }

    #[test]
    fn test_parse_gdbus_value_bool() {
        let v = parse_gdbus_value("<true>").unwrap();
        assert_eq!(v, serde_json::Value::Bool(true));
    }

    #[test]
    fn test_parse_gdbus_value_array() {
        let v = parse_gdbus_value("['a', 'b', 'c']").unwrap();
        assert_eq!(v.as_array().unwrap().len(), 3);
    }

    #[test]
    fn test_parse_gdbus_value_empty_array() {
        let v = parse_gdbus_value("[]").unwrap();
        assert_eq!(v, serde_json::Value::Array(vec![]));
    }

    #[test]
    fn test_parse_gdbus_value_dict() {
        let v = parse_gdbus_value("{charge: <42>, isCharging: <true>}").unwrap();
        let obj = v.as_object().unwrap();
        assert_eq!(
            obj.get("charge").unwrap(),
            &serde_json::Value::Number(42.into())
        );
        assert_eq!(
            obj.get("isCharging").unwrap(),
            &serde_json::Value::Bool(true)
        );
    }

    #[test]
    fn test_parse_gdbus_value_empty_dict() {
        let v = parse_gdbus_value("{}").unwrap();
        assert_eq!(v, serde_json::Value::Object(serde_json::Map::new()));
    }

    #[test]
    fn test_parse_gdbus_value_single_tuple() {
        let v = parse_gdbus_value("('hello',)").unwrap();
        assert_eq!(v, serde_json::Value::String("hello".to_string()));
    }

    #[test]
    fn test_parse_gdbus_value_multi_tuple() {
        let v = parse_gdbus_value("('a', <42>, <true>)").unwrap();
        let arr = v.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0], serde_json::Value::String("a".to_string()));
        assert_eq!(arr[1], serde_json::Value::Number(42.into()));
        assert_eq!(arr[2], serde_json::Value::Bool(true));
    }

    #[test]
    fn test_parse_gdbus_dict_trailing_comma() {
        let v = parse_gdbus_dict("({'charge': <42>, 'isCharging': <true>},)").unwrap();
        let obj = v.as_object().unwrap();
        assert_eq!(
            obj.get("charge").unwrap(),
            &serde_json::Value::Number(42.into())
        );
    }

    #[test]
    fn test_parse_gdbus_dict_nested() {
        let v = parse_gdbus_dict("({'level': <95>, 'status': <'Charging'>},)").unwrap();
        let obj = v.as_object().unwrap();
        assert_eq!(
            obj.get("level").unwrap(),
            &serde_json::Value::Number(95.into())
        );
        assert_eq!(
            obj.get("status").unwrap(),
            &serde_json::Value::String("Charging".to_string())
        );
    }

    #[test]
    fn test_parse_gdbus_dict_with_comma_in_value() {
        let v = parse_gdbus_dict("({'text': <'Hello, World'>},)").unwrap();
        let obj = v.as_object().unwrap();
        assert_eq!(
            obj.get("text").unwrap(),
            &serde_json::Value::String("Hello, World".to_string())
        );
    }

    #[test]
    fn test_parse_gdbus_value_variant_string() {
        let v = parse_gdbus_value("<'notification_name'>").unwrap();
        assert_eq!(
            v,
            serde_json::Value::String("notification_name".to_string())
        );
    }

    #[test]
    fn test_parse_gdbus_value_variant_dict() {
        let v = parse_gdbus_value("<{'key': <'val'>}>").unwrap();
        let obj = v.as_object().unwrap();
        assert_eq!(
            obj.get("key").unwrap(),
            &serde_json::Value::String("val".to_string())
        );
    }

    #[test]
    fn test_parse_sms_output_basic() {
        // This tests the pattern matching, not the actual ADB output
        let line = "Row: 0 _id=123, address=+15551234567, body=Hello there, date=1724000000000, read=1, type=2";
        let id = line
            .split("_id=")
            .nth(1)
            .and_then(|s| s.split(',').next())
            .and_then(|s| s.trim().parse::<u64>().ok());
        assert_eq!(id, Some(123));
    }

    #[test]
    fn test_parse_sms_address_finding() {
        let line = "Row: 0 _id=123, address=+15551234567, body=Hello, World! How are you?, date=1724000000000";
        let address = line
            .split("address=")
            .nth(1)
            .and_then(|s| s.split(", body=").next())
            .map(|s| s.trim().to_string());
        assert_eq!(address, Some("+15551234567".to_string()));
    }

    #[test]
    fn test_parse_sms_body_with_commas() {
        let line = "Row: 0 _id=123, address=+15551234567, body=Hello, World! How are you?, date=1724000000000";
        let body = line
            .split("body=")
            .nth(1)
            .and_then(|s| s.split(", date=").next())
            .map(|s| s.trim().to_string());
        assert_eq!(body, Some("Hello, World! How are you?".to_string()));
    }
}

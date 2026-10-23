pub mod adguard;
pub mod homeassistant;
pub mod http_service;
pub mod kdeconnect;
pub mod lidarr;
pub mod myspeed;
pub mod nextcloud;
pub mod phone;
pub mod ticketing;

pub use http_service::{
    plex_identity, plex_libraries, probe, HttpServiceClient, PlexIdentity, PlexLibrary,
    RestService, ServiceAuth, ServiceConfig, ServiceHealth,
};

pub use adguard::{
    AdGuardClient, AdGuardClientWrapper, AdGuardConfig, AdGuardDHCP, AdGuardDHCPLease,
    AdGuardFilter, AdGuardQueryLog, AdGuardQueryLogEntry, AdGuardStats, AdGuardStatus,
};
pub use homeassistant::{
    HomeAssistantArea, HomeAssistantClient, HomeAssistantConfig, HomeAssistantConfigData,
    HomeAssistantDevice, HomeAssistantEntityRegistry, HomeAssistantServices, HomeAssistantState,
};
pub use kdeconnect::{
    KdeConnectBattery, KdeConnectClient, KdeConnectConfig, KdeConnectConnectivity,
    KdeConnectContact, KdeConnectFile, KdeConnectMprisStatus, KdeConnectNotification,
    KdeConnectTelephony,
};
pub use lidarr::{
    LidarrAlbum, LidarrArtist, LidarrClient, LidarrConfig, LidarrDiskSpace, LidarrHealthIssue,
    LidarrIndexer, LidarrQueue, LidarrSystemStatus, LidarrWantedMissing,
};
pub use myspeed::{
    MySpeedClient, MySpeedConfig, MySpeedServer, MySpeedStats, MySpeedSummary, MySpeedTest,
};
pub use nextcloud::{
    NextcloudActivity, NextcloudClient, NextcloudConfig, NextcloudServerInfo,
    NextcloudStorageStats, NextcloudSystemStatus, NextcloudUser,
};
pub use phone::{
    PhoneActivity, PhoneApp, PhoneBattery, PhoneClient, PhoneConfig, PhoneDeviceInfo, PhoneMemory,
    PhoneNetwork, PhoneProcess, PhoneScreen, PhoneStorage,
};

// MC-1b — Tauri command wrapper for the ticketing service with live bridge + OFF-1 fallback.

use crate::services::ticketing::{self, TicketingOverview};

/// Returns the ticketing overview from live sandbox bridge with OFF-1 fallback,
/// or from mock fixture if live bridge not configured.
/// - MC-1 mode: returns mock fixture (from_mock=true, offline_reason=none).
/// - MC-1b mode: attempts live sandbox bridge GET with token; on any failure,
///   falls back to mock (OFF-1) with specific offline_reason.
/// - Never writes, never calls Stripe, never reads .env, real vault untouched.
#[tauri::command]
pub async fn ticketing_overview() -> Result<TicketingOverview, String> {
    ticketing::fetch_overview().await
}

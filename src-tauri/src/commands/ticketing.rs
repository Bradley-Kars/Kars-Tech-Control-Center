// MC-1b — Tauri command wrapper for the ticketing service with live bridge + OFF-1 fallback.

use crate::services::ticketing::{self, TicketingOverview, TicketRow};

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

/// Create a ticket via the live bridge (POST /tickets).
///
/// - MC-1b mode: attempts live bridge POST with token; on any failure, returns Err.
/// - Requires `bridge_url` + `bridge_token` from config.private.json.
#[tauri::command]
pub async fn ticketing_create_ticket(
    title: String,
    priority: String,
    category: Option<String>,
) -> Result<TicketRow, String> {
    ticketing::create_ticket(title, priority, category).await
}

/// Add a worklog entry to a ticket via the live bridge (POST /tickets/{id}/worklog).
///
/// - MC-1b mode: attempts live bridge POST with token; on any failure, returns Err.
/// - Requires `bridge_url` + `bridge_token` from config.private.json.
#[tauri::command]
pub async fn ticketing_add_worklog(
    ticket_id: String,
    entry: String,
    date: Option<String>,
    mode: Option<String>,
    hours: Option<f64>,
    payment: Option<String>,
    amount: Option<f64>,
) -> Result<(), String> {
    ticketing::add_worklog(ticket_id, entry, date, mode, hours, payment, amount).await
}

/// Change the status of a ticket via the live bridge (POST /tickets/{id}/status).
///
/// - MC-1b mode: attempts live bridge POST with token; on any failure, returns Err.
/// - Requires `bridge_url` + `bridge_token` from config.private.json.
#[tauri::command]
pub async fn ticketing_change_status(ticket_id: String, status: String) -> Result<(), String> {
    ticketing::change_status(ticket_id, status).await
}

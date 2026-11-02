# Unraid Backend Design

## Overview

Adds Unraid server monitoring to the KTS Master Control backend. Provides a
pluggable client that queries the Unraid REST API and returns normalized data
to the frontend. No live Unraid calls are made in tests — recorded fixtures
are used instead.

## Design Decisions

- **Auth via env var**: `KTS_UNRAID_TOKEN` (Unraid API token). Never hardcoded.
- **Pluggable client**: `UnraidClient` interface with a real HTTP implementation
  and a test fixture implementation.
- **No live Unraid calls in tests**: All tests use recorded fixtures.
- **Root endpoint**: `/unraid/...` under the existing FastAPI bridge (port 8799).
- **Token scope**: Requires `read` scope token (consistent with bridge auth model).

## API Contract

### Base Path: `/unraid`

All endpoints require a valid bearer token with `read` scope.

### GET /unraid/array

Returns Unraid array status.

**Response:**
```json
{
  "state": "STARTED|STOPPED|MAINTENANCE|...",
  "disks": [
    {
      "device": "sda",
      "name": "disk1",
      "size": "8.00 TB",
      "used": "2.00 TB",
      "temperature": 35,
      "smart_status": "PASSED|FAILED|...",
      "spun_up": true
    }
  ],
  "parity": {
    "status": "active|disabled|...",
    "sync": 45.5
  },
  "capacity": {
    "total": "16.00 TB",
    "used": "4.00 TB",
    "free": "12.00 TB"
  }
}
```

### GET /unraid/shares

Returns list of shares.

**Response:**
```json
{
  "shares": [
    {
      "name": "array",
      "path": "/mnt/array",
      "free": "4.00 TB",
      "used": "2.00 TB"
    }
  ]
}
```

### GET /unraid/docker

Returns Docker container status.

**Response:**
```json
{
  "containers": [
    {
      "name": "nextcloud",
      "image": "nextcloud:latest",
      "state": "running",
      "status": "Up 2 weeks"
    }
  ]
}
```

### GET /unraid/summary

Returns combined array + docker summary (for dashboard use).

**Response:**
```json
{
  "array": { ... },
  "docker": { ... },
  "updated_at": "2026-11-02T10:30:00Z"
}
```

## Authentication

All endpoints require `Authorization: Bearer <token>` where `<token>` is
`KTS_UNRAID_TOKEN` environment variable. Token scope must be `read`.

## Client Interface

```python
class UnraidClient:
    """Pluggable Unraid API client."""

    async def get_array(self) -> dict: ...
    async def get_shares(self) -> dict: ...
    async def get_docker(self) -> dict: ...
    async def get_summary(self) -> dict: ...
```

Two implementations:
1. `RealUnraidClient` — makes HTTP requests to the Unraid server
2. `FixtureUnraidClient` — returns recorded fixtures (used in tests)

## Test Fixtures

Recorded fixtures stored in `backend/tests/fixtures/unraid/`:
- `array_started.json`
- `array_stopped.json`
- `shares.json`
- `docker_running.json`
- `summary_normal.json`

No live Unraid calls are made in any test.

## Security

- No secrets in code or committed fixtures
- Token read from `KTS_UNRAID_TOKEN` environment variable at startup
- Missing token → all endpoints return 503
- Invalid token → 401

## Implementation Plan

1. Create `backend/core/services/unraid_service.py` — UnraidClient interface + implementations
2. Add routes to `backend/core/bridge.py` — GET /unraid/array, /unraid/shares, /unraid/docker, /unraid/summary
3. Create `backend/tests/fixtures/unraid/` — recorded fixture JSON files
4. Add `backend/tests/test_unraid.py` — tests using fixtures only

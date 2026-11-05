# Master Control MCP server — registration & API token

The KTS Master Control stdio MCP server (`backend/mcp/server.py`) exposes the
pre-deletion `cli` MCP tools (see `docs/mcp/TOOLS.md`) over JSON-RPC 2.0
(newline-delimited, MCP protocol `2025-06-18`). Each tool proxies to its
matching `/api/fleet` route on the web backend over HTTP, using
`KTS_API_URL` and `KTS_API_TOKEN` from the environment. The MCP server never
reads `servers.json` itself; the backend owns the server registry and every
route is identity-enforced (401 without a token; `scope=write` for POST/DELETE).

Run it as a stdio subprocess:

```
python <path-to-repo>/backend/mcp/server.py
```

## 1. Create the API token

Tokens are minted once with the backend's token table; the plaintext secret is
returned only from `mint()` and is never stored anywhere (only a PBKDF2 hash is
kept). Mint from a Python shell in the repo (the table lives at
`~/.ticketing/auth/token-table.json` by default, overridable with `KTS_HOME`):

```python
from core.auth import TokenTable
from core.paths import home_root

table = TokenTable(home_root() / "auth" / "token-table.json")
token_id, secret = table.mint("mcp-client", scope="read")   # read-only tools
# token_id, write_secret = table.mint("mcp-write-client", scope="write")  # mutating tools

print(token_id)  # e.g. tok_<...>  — safe to log
print(secret)    # e.g. kts_<...>  — shown ONCE, never store it
```

- `scope="read"` (default) covers the read-only tools (servers, stats, alerts,
  AdGuard status, …).
- `scope="write"` is required for mutating routes (docker start/stop/restart,
  shell exec, AdGuard enable/disable). Destructive write tools additionally
  require an explicit `confirm: true` argument, validated in the MCP layer and
  never forwarded to the backend.
- Revoke a token immediately with `table.revoke(token_id)` if it is lost or
  compromised.

Never commit a token, never print it in logs, and never put real hostnames or
emails in any config.

## 2. Register in opencode MCP config

Add an `mcpServers` entry to your opencode MCP configuration. Placeholders only
— replace `<…>` with your own values:

```json
{
  "mcpServers": {
    "kts-master-control": {
      "command": "python",
      "args": [
        "<absolute-path-to-repo>/backend/mcp/server.py"
      ],
      "env": {
        "KTS_API_URL": "http://127.0.0.1:<PORT>",
        "KTS_API_TOKEN": "kts_<your-minted-secret>"
      }
    }
  }
}
```

`<PORT>` is the port the web backend listens on (`uvicorn core.bridge:app` or
whatever the backend is bound to). Use `scope="write"` when you minted a write
token and intend to call mutating tools.

## 3. Register in Claude MCP config

Add the same entry to Claude Desktop's MCP config
(`claude_desktop_config.json`, e.g.
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or
`%APPDATA%\Claude\claude_desktop_config.json` on Windows). Placeholders only:

```json
{
  "mcpServers": {
    "kts-master-control": {
      "command": "python",
      "args": [
        "<absolute-path-to-repo>/backend/mcp/server.py"
      ],
      "env": {
        "KTS_API_URL": "http://127.0.0.1:<PORT>",
        "KTS_API_TOKEN": "kts_<your-minted-secret>"
      }
    }
  }
}
```

Restart Claude Desktop after saving. The server then appears in Claude's tool
picker as `kts-master-control` with the tools from `docs/mcp/TOOLS.md`.

## Notes

- Six tools in `docs/mcp/TOOLS.md` have no `/api/fleet` route yet
  (`mc_shell_fleet`, `mc_reboot`, `mc_shutdown`, `mc_prometheus_health`,
  `mc_prometheus_query`, `mc_tailscale_peers`) and are not wired.
- Power operations (reboot/shutdown) go through MeshCentral only — never raw
  SSH — per the fleet's standing rule.
- The MCP server never reads `servers.json`; all secrets live in `KTS_API_TOKEN`
  (env) and, on the backend, in the token table — never in the repo.

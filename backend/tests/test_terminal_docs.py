"""T6: terminal profile documentation.

docs/ARCHITECTURE_WEB.md must document both the "opencode" and "hermes"
terminal profiles (name, purpose, how to connect, which websocket path).
backend/config/local.yaml.example must carry the terminal profile
configuration section so operators can copy it into local.yaml.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_ARCH = REPO_ROOT / "docs" / "ARCHITECTURE_WEB.md"
LOCAL_YAML_EXAMPLE = REPO_ROOT / "backend" / "config" / "local.yaml.example"


def test_architecture_docs_document_opencode_profile():
    """docs/ARCHITECTURE_WEB.md must document the opencode terminal profile."""
    text = DOCS_ARCH.read_text()
    assert "opencode" in text, "ARCHITECTURE_WEB.md does not mention the opencode profile"
    assert "hermes" in text, "ARCHITECTURE_WEB.md does not mention the hermes profile"


def test_architecture_docs_document_websocket_path():
    """Both profiles must be tied to the /ws/pty/{profile} websocket path."""
    text = DOCS_ARCH.read_text()
    assert "/ws/pty/" in text, "ARCHITECTURE_WEB.md does not document the /ws/pty/ websocket path"


def test_local_yaml_example_has_terminal_profiles():
    """backend/config/local.yaml.example must carry a terminal_profiles section."""
    text = LOCAL_YAML_EXAMPLE.read_text()
    assert "terminal_profiles" in text, "local.yaml.example is missing terminal_profiles section"
    assert "opencode" in text, "local.yaml.example does not configure the opencode profile"
    assert "hermes" in text, "local.yaml.example does not configure the hermes profile"

"""backend/fleet/parsers/nvidia.py tests (P2).

Placeholder values only. No real GPU, no nvidia-smi binary required.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.parsers.nvidia import parse_nvidia_smi  # noqa: E402

NVIDIA_SMI_CSV = "GeForce RTX 4090, 535.86.01, 24576, 2048, 58, 99\n"


def test_parses_full_nvidia_smi_output():
    info = parse_nvidia_smi(NVIDIA_SMI_CSV)
    assert info is not None
    assert info["name"] == "GeForce RTX 4090"
    assert info["driver_version"] == "535.86.01"
    assert info["temperature"] == "58"
    assert info["memory_used"] == "2048"
    assert info["memory_total"] == "24576"
    assert info["utilization"] == "99"


def test_returns_none_for_non_nvidia_output():
    assert parse_nvidia_smi("some random text without NVIDIA-SMI") is None
    assert parse_nvidia_smi("") is None


def test_missing_fields_default_to_empty_strings():
    info = parse_nvidia_smi("GeForce RTX 4090, 535.86.01, 24576, 2048, 58, 99\n")
    for field in ("cuda_version", "power_usage", "power_cap", "fan_speed"):
        assert info[field] == ""

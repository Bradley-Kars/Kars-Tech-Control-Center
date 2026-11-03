"""backend/fleet/parsers/smart.py tests (P2).

Placeholder values only. No real disk, no smartctl binary required.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.parsers.smart import parse_smartctl  # noqa: E402

SMARTCTL_OUTPUT = """smartctl 7.2 2022-02-28 r5435 [x86_64-linux-6.1.15-unraid] (local build)
Copyright (C) 2002-20, Bruce Allen, Christian Franke, www.smartmontools.org

=== START OF INFORMATION SECTION ===
Model Family:     Samsung based SSDs
Device Model:     Samsung SSD 870 EVO
User Capacity:    500,107,862,016 bytes [500 GB]
SMART overall-health self-assessment test result: PASSED

=== START OF READ SMART DATA SECTION ===
SMART Attributes Data Structure revision number: 16
Vendor Specific SMART Attributes with Thresholds:
ID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED  WHEN_FAILED RAW_VALUE
  9 Power_On_Hours          0x0032   097   097   000    Old_age   Always       -       12345
 10 Spin_Retry_Count        0x0032   100   100   000    Old_age   Always       -       0
 194 Temperature_Celsius     0x0022   032   032   000    Old_age   Always       -       32
 196 Reallocated_Sector_Ct   0x0032   100   100   000    Old_age   Always       -       0
 197 Current_Pending_Sector  0x0032   100   100   000    Old_age   Always       -       0
"""


def test_parses_smartctl_output():
    info = parse_smartctl(SMARTCTL_OUTPUT, "/dev/sda")
    assert info["device"] == "/dev/sda"
    # Model Family appears first in the sample, so it wins (mirrors smart.rs first-wins).
    assert info["model"] == "Samsung based SSDs"
    assert info["capacity"] == "500,107,862,016 bytes [500 GB]"
    assert info["power_on_hours"] == "097"
    assert info["temperature"] == "032"
    assert info["reallocated_sectors"] == "100"
    assert info["pending_sectors"] == "100"
    assert info["health"] == "PASSED"


def test_health_defaults_to_unknown():
    info = parse_smartctl("no health line here", "/dev/sdb")
    assert info["device"] == "/dev/sdb"
    assert info["health"] == "UNKNOWN"
    assert info["model"] == ""
    assert info["capacity"] == ""

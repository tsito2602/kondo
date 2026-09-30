"""Regenerate the offline IATA catalog; no network access during app builds.

python scripts/update-airports.py
Optional --airports /path/airports.csv --timezones /path/airports.json use local snapshots.
"""
import argparse
import csv
import hashlib
import io
import json
import re
from datetime import date
from pathlib import Path
from urllib.request import urlopen
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SOURCES = {
    "airports": "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv",
    "timezones": "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json",
}


def generate(airport_bytes, timezone_bytes):
    zones = {}
    for airport in json.loads(timezone_bytes).values():
        zones.setdefault(airport["iata"], []).append(airport)
    rows = []
    for airport in csv.DictReader(io.StringIO(airport_bytes.decode("utf-8-sig"))):
        code = airport["iata_code"].strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", code):
            continue
        time_zone = ""
        for candidate in zones.get(code, []):
            same_location = (
                abs(float(airport["latitude_deg"]) - candidate["lat"]) < 0.05
                and abs(float(airport["longitude_deg"]) - candidate["lon"]) < 0.05
            )
            if not same_location:
                continue
            try:
                ZoneInfo(candidate["tz"])
                time_zone = candidate["tz"]
                break
            except (ZoneInfoNotFoundError, ValueError):
                pass
        rows.append([
            code, airport["name"], airport["municipality"], airport["iso_country"],
            airport["keywords"], time_zone, int(airport["scheduled_service"] == "yes"),
        ])
    rows.sort(key=lambda row: row[0])
    if len(rows) < 8000 or len({row[0] for row in rows}) != len(rows):
        raise ValueError("Unexpected catalog size or duplicate IATA codes; inspect upstream data before updating")
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in SOURCES:
        parser.add_argument(f"--{name}", type=Path)
    args = parser.parse_args()
    snapshots = {
        name: getattr(args, name).read_bytes() if getattr(args, name)
        else urlopen(url, timeout=60).read()
        for name, url in SOURCES.items()
    }
    rows = generate(snapshots["airports"], snapshots["timezones"])
    metadata = {
        "updatedOn": date.today().isoformat(),
        "count": len(rows),
        "columns": ["iata", "name", "city", "country", "keywords", "timeZone", "scheduledService"],
        "sources": {name: {"url": url, "sha256": hashlib.sha256(snapshots[name]).hexdigest()} for name, url in SOURCES.items()},
    }
    output = Path(__file__).resolve().parents[1] / "src/data/airports-world.json"
    output.write_text(json.dumps(metadata, ensure_ascii=False, indent=2)[:-2] + ',\n  "rows": [\n' +
                      ",\n".join("    " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) +
                      "\n  ]\n}\n", encoding="utf-8")
    print(f"Saved {len(rows)} IATA airports ({sum(bool(row[5]) for row in rows)} verified timezone matches), {output.stat().st_size} bytes")

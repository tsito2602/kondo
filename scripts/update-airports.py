"""Regenerate the offline IATA catalog; no network access during app builds.

python scripts/update-airports.py
Optional --airports /path/airports.csv --timezones /path/airports.json --names /path/optd_por_public.csv use local snapshots.
Japanese names come from OpenTravelData (GeoNames / Wikidata alternate names). When an airport has
no Japanese name, the Japanese name of its city becomes "<city>空港"; otherwise the English name stays.
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
    "names": "https://raw.githubusercontent.com/opentraveldata/opentraveldata/master/opentraveldata/optd_por_public.csv",
}
AIRPORT_WORDS = ("空港", "飛行場", "ヘリポート", "基地", "水上機")
LATIN = re.compile(r"[A-Za-z]")
JAPANESE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")


def japanese_names(row):
    """Preferred Japanese names first (entries are lang|name|flags; flag "p" marks the preferred name)."""
    names = []
    for part in row["alt_name_section"].split("="):
        fields = part.split("|") + ["", ""]
        if fields[0] == "ja" and JAPANESE.search(fields[1]) and not LATIN.search(fields[1]):
            names.append(("p" not in fields[2], fields[1].strip()))
    return [name for _, name in sorted(names, key=lambda item: item[0])]


def load_japanese(names_bytes):
    csv.field_size_limit(1 << 30)
    airports, cities = {}, {}
    for row in csv.DictReader(io.StringIO(names_bytes.decode("utf-8")), delimiter="^"):
        code, kind = row["iata_code"], row["location_type"]
        if "C" in kind and not row["date_until"]:
            found = japanese_names(row)
            if found:
                cities.setdefault(code, found[0])
        if "A" in kind:
            airports.setdefault(code, []).append(row)
    return airports, cities


def same_airport(code, lat, lon, airports):
    """The OpenTravelData row for this airport: current rows first, then the nearest (within ~1 degree)."""
    distance = lambda row: abs(float(row["latitude"] or 0) - lat) + abs(float(row["longitude"] or 0) - lon)
    candidates = sorted(airports.get(code, []), key=lambda row: (bool(row["date_until"]), distance(row)))
    return candidates[0] if candidates and distance(candidates[0]) <= 1 else None


def japanese_for(row, cities, served, countries):
    city, only_airport = "", False
    for city_code in (row["city_code_list"].split(",") if row else []):
        if cities.get(city_code):
            city, only_airport = cities[city_code], served.get(city_code, 0) <= 1
            break
    city = re.sub(r"(?<=.{2})(特別市|市)$", "", city)
    name = (japanese_names(row) or [""])[0] if row else ""
    if name and not any(word in name for word in AIRPORT_WORDS):
        name += "空港"
    # "<city>空港" only when the city has no other airport, so it cannot name the wrong one.
    if not name and only_airport and city not in countries:
        name = city + "空港"
    return name, city


def generate(airport_bytes, timezone_bytes, names_bytes, countries=frozenset()):
    japanese_airports, japanese_cities = load_japanese(names_bytes)
    zones = {}
    for airport in json.loads(timezone_bytes).values():
        zones.setdefault(airport["iata"], []).append(airport)
    listed = []
    served = {}  # airports with scheduled service per city code
    for airport in csv.DictReader(io.StringIO(airport_bytes.decode("utf-8-sig"))):
        code = airport["iata_code"].strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", code):
            continue
        match = same_airport(code, float(airport["latitude_deg"]), float(airport["longitude_deg"]), japanese_airports)
        listed.append((airport, code, match))
        if match and airport["scheduled_service"] == "yes":
            for city_code in match["city_code_list"].split(","):
                served[city_code] = served.get(city_code, 0) + 1
    rows = []
    for airport, code, match in listed:
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
        name_ja, city_ja = japanese_for(match, japanese_cities, served, countries)
        rows.append([
            code, airport["name"], airport["municipality"], airport["iso_country"],
            airport["keywords"], time_zone, int(airport["scheduled_service"] == "yes"),
            name_ja, city_ja,
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
    countries = frozenset(json.loads((Path(__file__).parent / "fixtures/country-names-ja.json").read_text(encoding="utf-8")))
    rows = generate(snapshots["airports"], snapshots["timezones"], snapshots["names"], countries)
    metadata = {
        "updatedOn": date.today().isoformat(),
        "count": len(rows),
        "columns": ["iata", "name", "city", "country", "keywords", "timeZone", "scheduledService", "nameJa", "cityJa"],
        "sources": {name: {"url": url, "sha256": hashlib.sha256(snapshots[name]).hexdigest()} for name, url in SOURCES.items()},
    }
    output = Path(__file__).resolve().parents[1] / "src/data/airports-world.json"
    output.write_text(json.dumps(metadata, ensure_ascii=False, indent=2)[:-2] + ',\n  "rows": [\n' +
                      ",\n".join("    " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) +
                      "\n  ]\n}\n", encoding="utf-8")
    print(f"Saved {len(rows)} IATA airports ({sum(bool(row[5]) for row in rows)} verified timezone matches, {sum(bool(row[7]) for row in rows)} Japanese names), {output.stat().st_size} bytes")

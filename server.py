"""Local full-stack server for Last Known Position (Python stdlib + SQLite)."""
from __future__ import annotations

import json
import mimetypes
import sqlite3
import uuid
import os
import subprocess
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
DB = ROOT / "last-known-position.sqlite3"
PORT = 8765
CATALOG = "https://history.nasa.gov/FINAL%20Catalogue%20of%20Manmade%20Material%20on%20the%20Moon.pdf"
MOON_PAGE = "https://www.nasa.gov/wp-content/uploads/static/history/humanartifacts.html"
MER_PAGE = "https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/"
ROVER_3D = "https://science.nasa.gov/3d-resources/mars-exploration-rover-opportunity-mer-b/"
MER_TWIN_3D = "https://science.nasa.gov/resource/spirit-and-opportunity-rover-3d-model/"
MEDIA_RULES = "https://www.nasa.gov/nasa-brand-center/images-and-media/"
PLANET_TEXTURES = {
    "Mercury": "https://maps.jpl.nasa.gov/tmaps/pix/mer0muu2.jpg",
    "Venus": "https://maps.jpl.nasa.gov/tmaps/pix/ven0ajj2.jpg",
    "Earth": "https://maps.jpl.nasa.gov/tmaps/pix/ear0xuu2.jpg",
    "Mars": "https://maps.jpl.nasa.gov/tmaps/pix/mar0kuu2.jpg",
    "Jupiter": "https://maps.jpl.nasa.gov/tmaps/pix/jup0vss1.jpg",
    "Saturn": "https://maps.jpl.nasa.gov/tmaps/pix/sat0fds1.jpg",
    "Uranus": "https://maps.jpl.nasa.gov/tmaps/pix/ura0fss1.jpg",
    "Neptune": "https://maps.jpl.nasa.gov/tmaps/pix/nep0fds1.jpg",
    "Moon": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg",
}
NASA_MODELS = {
    "mer": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/mars-exploration-rover---opportunity-%28mer-b%29/Mars%20Exploration%20Rover%20-%20Opportunity%20%28MER-B%29.glb",
    "perseverance": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/mars-2020-perseverance-rover/Mars%202020%20Perseverance%20Rover.glb",
    "ingenuity": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/ingenuity-mars-helicopter/Ingenuity%20Mars%20Helicopter.glb",
    "odyssey": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/mars-odyssey/Mars%20Odyssey.glb",
    "mro": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/mars-reconnaissance-orbiter-%28mro%29-%28c%29/Mars%20Reconnaissance%20Orbiter%20%28MRO%29%20%28C%29.glb",
    "maven": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/mars-atmosphere-and-volatile-evolution-%28maven%29-%28b%29/Mars%20Atmosphere%20and%20Volatile%20EvolutioN%20%28MAVEN%29%20%28B%29.glb",
}
NASA_ASSET_CACHE: dict[str, bytes] = {}

def fetch_verified_nasa_asset(key: str, url: str) -> bytes:
    cached = NASA_ASSET_CACHE.get(key)
    if cached is not None:
        return cached
    environment = os.environ.copy()
    # Node uses the Windows system root store, retaining normal certificate checks.
    environment["NODE_USE_SYSTEM_CA"] = "1"
    result = subprocess.run(
        ["node", str(ROOT / "fetch-nasa-asset.mjs"), url],
        capture_output=True, timeout=45, env=environment, check=False)
    if result.returncode:
        detail = result.stderr.decode("utf-8", errors="replace")[:500]
        raise RuntimeError(detail or "remote NASA asset request failed")
    NASA_ASSET_CACHE[key] = result.stdout
    return result.stdout

SOURCES = [
    ("NASA Moon artifact catalogue (2012)", CATALOG, "NASA History Program Office; coordinate and unknown-location records; catalogue dated 2012."),
    ("NASA: Human Artifacts on the Moon", MOON_PAGE, "NASA compilation page; explains scope and lunar-orbit ascent-stage caveats."),
    ("NASA: Mars Exploration Rovers", MER_PAGE, "NASA mission record for Spirit and Opportunity."),
    ("NASA: Opportunity rover 3D model", ROVER_3D, "NASA/Ames Research Center model resource; official GLB is linked from this page."),
    ("NASA/JPL: Spirit and Opportunity rover 3D model", MER_TWIN_3D, "Interactive NASA/JPL-Caltech model of the twin Mars Exploration Rovers."),
    ("NASA Images and Media Usage Guidelines", MEDIA_RULES, "Attribution and use guidance for NASA media."),
]

# Coordinates and unknown statuses below are transcribed from the NASA History Program Office
# 2012 catalogue. Mars positions are deliberately stored as named landing regions without
# invented latitude/longitude values. Every record is linked to its supporting source rows.
SEED = [
    ("apollo-11-descent", "Apollo 11 LM descent stage", "Apollo 11 · Tranquility Base", "The descent stage remained at the landing site after the ascent stage departed. NASA's 2012 catalogue lists its coordinate.", "Moon", "Pinned", 0.67408, 23.47297, "0.67408° N, 23.47297° E", "△", None, [0, 1]),
    ("apollo-11-ascent", "Apollo 11 LM ascent stage", "Apollo 11 · lunar orbit, later impact unknown", "NASA says the ascent stage was left in lunar orbit and later impacted the Moon; its precise impact location is unknown. It is not a known surface object at a pinned coordinate.", "Moon", "Missing", None, None, "Unknown impact location", "?", None, [0, 1]),
    ("apollo-12-descent", "Apollo 12 LM descent stage", "Apollo 12 · Oceanus Procellarum", "The descent stage remained at the Apollo 12 landing site. The catalogue provides a coordinate.", "Moon", "Pinned", -3.01239, -23.42157, "3.01239° S, 23.42157° W", "△", None, [0, 1]),
    ("apollo-14-descent", "Apollo 14 LM descent stage", "Apollo 14 · Fra Mauro", "The descent stage remained on the lunar surface. The catalogue provides a coordinate.", "Moon", "Pinned", -3.64530, -17.47136, "3.64530° S, 17.47136° W", "△", None, [0, 1]),
    ("apollo-16-descent", "Apollo 16 LM descent stage", "Apollo 16 · Descartes Highlands", "The descent stage is listed at a coordinate. Apollo 16's ascent stage is a separate object whose eventual impact location is unknown.", "Moon", "Pinned", -8.97301, 15.50019, "8.97301° S, 15.50019° E", "△", None, [0, 1]),
    ("apollo-16-ascent", "Apollo 16 LM ascent stage", "Apollo 16 · lunar orbit, later impact unknown", "NASA says the ascent stage was left in lunar orbit and later impacted the Moon; its precise impact location is unknown.", "Moon", "Missing", None, None, "Unknown impact location", "?", None, [0, 1]),
    ("apollo-17-descent", "Apollo 17 LM descent stage", "Apollo 17 · Taurus–Littrow", "The descent stage remained at the Apollo 17 landing site. The catalogue provides a coordinate.", "Moon", "Pinned", 20.19080, 30.77168, "20.19080° N, 30.77168° E", "△", None, [0, 1]),
    ("survey-3", "Surveyor 3", "Surveyor 3 · Oceanus Procellarum", "A robotic lunar lander visited by Apollo 12. NASA's catalogue lists its coordinate; it is also a useful example of hardware returned to by a crewed mission.", "Moon", "Pinned", -3.015, -23.418, "3.015° S, 23.418° W", "◈", None, [0, 1]),
    ("survey-4", "Surveyor 4", "Surveyor program · location unknown", "The 2012 NASA catalogue explicitly records the location as UNKNOWN. The dashboard preserves that uncertainty rather than placing a made-up pin.", "Moon", "Missing", None, None, "Unknown", "?", None, [0]),
    ("explorer-35", "Explorer 35 (IMP-E)", "Lunar orbit mission · location unknown", "The 2012 NASA catalogue explicitly records the location as UNKNOWN. No coordinate is plotted.", "Moon", "Missing", None, None, "Unknown", "?", None, [0]),
    ("spirit-rover", "Spirit rover", "Mars Exploration Rover · Gusev Crater", "Spirit was one of NASA's twin Mars Exploration Rovers. This archive stores the named landing region; precise surface coordinates are not asserted in this starter record.", "Mars", "Estimated", None, None, "Gusev Crater · named region", "✥", MER_TWIN_3D, [2, 3, 4, 5]),
    ("opportunity-rover", "Opportunity rover", "Mars Exploration Rover · Meridiani Planum", "Opportunity and Spirit were twin Mars Exploration Rovers. The 3D viewer uses NASA/JPL's interactive twin-rover model; this record keeps the named landing region without asserting a surveyed coordinate.", "Mars", "Estimated", None, None, "Meridiani Planum · named region", "✥", MER_TWIN_3D, [2, 3, 4, 5]),
]

def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db

def init_db() -> None:
    with connect() as db:
        db.executescript("""
          CREATE TABLE IF NOT EXISTS sources(id INTEGER PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, note TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS artifacts(
            id TEXT PRIMARY KEY, name TEXT NOT NULL, mission TEXT NOT NULL, body TEXT NOT NULL,
            world TEXT NOT NULL CHECK(world IN ('Moon','Mars')), status TEXT NOT NULL CHECK(status IN ('Photographed','Pinned','Estimated','Missing')),
            latitude REAL, longitude REAL, location_label TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '◇', model_url TEXT,
            active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS artifact_sources(artifact_id TEXT NOT NULL REFERENCES artifacts(id), source_id INTEGER NOT NULL REFERENCES sources(id), PRIMARY KEY(artifact_id,source_id));
        """)
        for source in SOURCES:
            db.execute("INSERT OR IGNORE INTO sources(title,url,note) VALUES(?,?,?)", source)
        twin_source = db.execute("SELECT id FROM sources WHERE url=?", (MER_TWIN_3D,)).fetchone()["id"]
        db.execute("UPDATE artifacts SET model_url=? WHERE id IN ('spirit-rover','opportunity-rover')", (MER_TWIN_3D,))
        db.execute("UPDATE artifacts SET body=? WHERE id='opportunity-rover' AND body LIKE 'Opportunity was Spirit%official Opportunity 3D model%'", ("Opportunity and Spirit were twin Mars Exploration Rovers. The 3D viewer uses NASA/JPL's interactive twin-rover model; this record keeps the named landing region without asserting a surveyed coordinate.",))
        db.executemany("INSERT OR IGNORE INTO artifact_sources(artifact_id,source_id) VALUES(?,?)", [("spirit-rover", twin_source), ("opportunity-rover", twin_source)])
        if db.execute("SELECT COUNT(*) FROM artifacts").fetchone()[0] == 0:
            now = datetime.now(timezone.utc).isoformat()
            ids = {r["url"]: r["id"] for r in db.execute("SELECT id,url FROM sources")}
            for row in SEED:
                ident,name,mission,body,world,status,lat,lon,location,icon,model,source_indexes = row
                db.execute("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (ident,name,mission,body,world,status,lat,lon,location,icon,model,1,now,now))
                for source_index in source_indexes:
                    db.execute("INSERT OR IGNORE INTO artifact_sources VALUES(?,?)", (ident, ids[SOURCES[source_index][1]]))

def artifact_json(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    sources = db.execute("SELECT s.id,s.title,s.url,s.note FROM sources s JOIN artifact_sources a ON a.source_id=s.id WHERE a.artifact_id=? ORDER BY s.id", (row["id"],)).fetchall()
    result = dict(row)
    result["sources"] = [dict(s) for s in sources]
    result["latitude"] = result["latitude"]
    result["longitude"] = result["longitude"]
    # Compatibility names used by the React starter app supplied for integration.
    result["celestial_body"] = result["world"]
    result["site"] = result["location_label"]
    result["summary"] = result["body"]
    result["coordinates"] = ({"lat": result["latitude"], "lng": result["longitude"]}
                              if result["latitude"] is not None and result["longitude"] is not None else None)
    result["si_disclosure"] = "AI-assisted code and interface copy; review artifact claims against the linked primary sources."
    result["si_metadata"] = {"assistance": "LLM-assisted code and selected text", "confidence": None}
    return result

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size > 100_000:
            raise ValueError("Request body is too large")
        return json.loads(self.rfile.read(size) or b"{}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/nasa-model/"):
            name = unquote(parsed.path.rsplit("/", 1)[-1])
            url = NASA_MODELS.get(name)
            if not url:
                return self.send_json({"error": "Unknown NASA 3D model"}, 404)
            try:
                raw = fetch_verified_nasa_asset(f"model:{name}", url)
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                return self.send_json({"error": f"NASA 3D model unavailable: {error}"}, 502)
            self.send_response(200)
            self.send_header("Content-Type", "model/gltf-binary")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(raw)
            return
        if parsed.path.startswith("/api/planet-texture/"):
            name = unquote(parsed.path.rsplit("/", 1)[-1])
            url = PLANET_TEXTURES.get(name)
            if not url:
                return self.send_json({"error": "Unknown planet texture"}, 404)
            try:
                raw = fetch_verified_nasa_asset(f"texture:{name}", url)
                content_type = "image/jpeg"
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                return self.send_json({"error": f"Planet texture unavailable: {error}"}, 502)
            except Exception as error:
                return self.send_json({"error": f"Planet texture unavailable: {error}"}, 502)
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "public, max-age=604800")
            self.end_headers()
            self.wfile.write(raw)
            return
        if parsed.path == "/api/health":
            try:
                with connect() as db:
                    db.execute("SELECT 1").fetchone()
                return self.send_json({"ok": True, "database": DB.name, "database_status": "connected"})
            except sqlite3.Error as error:
                return self.send_json({"ok": False, "database": DB.name, "database_status": "error", "detail": str(error)}, 503)
        if parsed.path == "/api/sources":
            with connect() as db:
                rows = db.execute("SELECT * FROM sources ORDER BY id").fetchall()
            return self.send_json([dict(x) for x in rows])
        if parsed.path == "/api/metrics":
            with connect() as db:
                data = {"total": db.execute("SELECT COUNT(*) FROM artifacts WHERE active=1").fetchone()[0],
                        "pinned": db.execute("SELECT COUNT(*) FROM artifacts WHERE active=1 AND status='Pinned'").fetchone()[0],
                        "missing": db.execute("SELECT COUNT(*) FROM artifacts WHERE active=1 AND status='Missing'").fetchone()[0],
                        "moon": db.execute("SELECT COUNT(*) FROM artifacts WHERE active=1 AND world='Moon'").fetchone()[0],
                        "mars": db.execute("SELECT COUNT(*) FROM artifacts WHERE active=1 AND world='Mars'").fetchone()[0]}
            return self.send_json(data)
        if parsed.path == "/api/telemetry/live":
            # Example sensor values adapted from the supplied starter API. They are
            # explicitly marked simulated and must not be presented as live mission data.
            with connect() as db:
                dormant = db.execute("SELECT COUNT(*) FROM artifacts WHERE active=1 AND status IN ('Estimated','Missing')").fetchone()[0]
            return self.send_json({
                "active_stations": 2,
                "dormant_relics": dormant,
                "total_mass_landed_kg": None,
                "mars_weather": {"sol": 4120, "temp_c": -62, "pressure_pa": 710, "wind_speed_ms": 7.4},
                "moon_weather": {"lunar_phase": "Waxing Gibbous", "solar_radiation_sv": 0.14, "surface_temp_day_c": 110, "surface_temp_night_c": -130},
                "source": "illustrative sample values; not live telemetry or a current weather feed",
                "si_audit_status": "AI assistance is disclosed in the application. Verify factual claims against the linked source records."
            })
        if parsed.path == "/api/artifacts":
            query = parse_qs(parsed.query)
            filters, values = ["active=1"], []
            selected_world = query.get("world", query.get("celestial_body", [""]))[0]
            if selected_world in ("Moon", "Mars"):
                filters.append("world=?"); values.append(selected_world)
            if query.get("status", [""])[0] in ("Photographed", "Pinned", "Estimated", "Missing"):
                filters.append("status=?"); values.append(query["status"][0])
            if query.get("q", [""])[0].strip():
                filters.append("(name LIKE ? OR mission LIKE ? OR body LIKE ? OR location_label LIKE ?)")
                term = "%" + query["q"][0].strip() + "%"; values.extend([term] * 4)
            with connect() as db:
                rows = db.execute("SELECT * FROM artifacts WHERE " + " AND ".join(filters) + " ORDER BY world,name", values).fetchall()
                data = [artifact_json(db, x) for x in rows]
            return self.send_json(data)
        if parsed.path.startswith("/api/artifacts/"):
            ident = unquote(parsed.path.rsplit("/", 1)[-1])
            with connect() as db:
                row = db.execute("SELECT * FROM artifacts WHERE id=? AND active=1", (ident,)).fetchone()
                if not row:
                    return self.send_json({"error":"Artifact not found"},404)
                return self.send_json(artifact_json(db,row))
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/artifacts":
            return self.send_json({"error":"Not found"},404)
        try:
            data = self.read_json()
            name = str(data.get("name", "")).strip()
            mission = str(data.get("mission", "")).strip()
            body = str(data.get("body", "")).strip()
            world = data.get("world")
            status = data.get("status", "Estimated")
            if not name or not mission or not body or world not in ("Moon", "Mars") or status not in ("Photographed", "Pinned", "Estimated", "Missing"):
                return self.send_json({"error":"Name, mission, description, valid world and evidence status are required."},400)
            ident = "user-" + uuid.uuid4().hex[:12]
            now = datetime.now(timezone.utc).isoformat()
            lat, lon = data.get("latitude"), data.get("longitude")
            try:
                lat = float(lat) if lat not in (None, "") else None
                lon = float(lon) if lon not in (None, "") else None
            except (ValueError, TypeError):
                return self.send_json({"error":"Coordinates must be numbers."},400)
            if (lat is None) != (lon is None) or (lat is not None and not -90 <= lat <= 90) or (lon is not None and not -180 <= lon <= 180):
                return self.send_json({"error":"Enter both latitude and longitude within valid ranges, or leave both blank."},400)
            with connect() as db:
                db.execute("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (ident,name,mission,body,world,status,lat,lon,str(data.get("location_label") or "Location not specified"),str(data.get("icon") or "◇"),None,1,now,now))
                row = db.execute("SELECT * FROM artifacts WHERE id=?",(ident,)).fetchone()
                return self.send_json(artifact_json(db,row),201)
        except (json.JSONDecodeError, ValueError) as exc:
            return self.send_json({"error":str(exc)},400)

    def do_PATCH(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api","artifacts"]:
            return self.send_json({"error":"Not found"},404)
        try:
            patch = self.read_json()
            allowed = {"name","mission","body","world","status","location_label","latitude","longitude"}
            patch = {k:v for k,v in patch.items() if k in allowed}
            if not patch:
                return self.send_json({"error":"No editable fields supplied."},400)
            if "world" in patch and patch["world"] not in ("Moon","Mars"):
                return self.send_json({"error":"World must be Moon or Mars."},400)
            if "status" in patch and patch["status"] not in ("Photographed","Pinned","Estimated","Missing"):
                return self.send_json({"error":"Invalid evidence status."},400)
            if "latitude" in patch or "longitude" in patch:
                try:
                    lat = float(patch["latitude"]) if patch.get("latitude") not in (None, "") else None
                    lon = float(patch["longitude"]) if patch.get("longitude") not in (None, "") else None
                except (ValueError, TypeError):
                    return self.send_json({"error":"Coordinates must be numbers."},400)
                if (lat is None) != (lon is None) or (lat is not None and not -90 <= lat <= 90) or (lon is not None and not -180 <= lon <= 180):
                    return self.send_json({"error":"Enter both latitude and longitude within valid ranges, or clear both."},400)
                patch["latitude"], patch["longitude"] = lat, lon
            patch["updated_at"] = datetime.now(timezone.utc).isoformat()
            with connect() as db:
                if not db.execute("SELECT 1 FROM artifacts WHERE id=? AND active=1",(parts[2],)).fetchone():
                    return self.send_json({"error":"Artifact not found"},404)
                db.execute("UPDATE artifacts SET " + ",".join(f"{k}=?" for k in patch) + " WHERE id=?", (*patch.values(),parts[2]))
                return self.send_json(artifact_json(db,db.execute("SELECT * FROM artifacts WHERE id=?",(parts[2],)).fetchone()))
        except (json.JSONDecodeError, ValueError) as exc:
            return self.send_json({"error":str(exc)},400)

    def do_DELETE(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api","artifacts"]:
            return self.send_json({"error":"Not found"},404)
        with connect() as db:
            cur = db.execute("UPDATE artifacts SET active=0,updated_at=? WHERE id=? AND active=1",(datetime.now(timezone.utc).isoformat(),parts[2]))
            if not cur.rowcount:
                return self.send_json({"error":"Artifact not found"},404)
        return self.send_json({"ok":True,"deleted":parts[2]})

if __name__ == "__main__":
    init_db()
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("model/gltf-binary", ".glb")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Last Known Position is running at http://127.0.0.1:{PORT}")
    print(f"SQLite database: {DB}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()

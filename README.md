# Last Known Position

An evidence-led Moon and Mars artifact explorer with a SQLite database and a local JSON API.

## Run it

1. Install Python 3.10 or newer if it is not already installed.
2. Double-click `run.bat`, or run `python server.py` in this folder.
3. Open `http://127.0.0.1:8765` in a browser.

The app creates `last-known-position.sqlite3` beside `server.py` the first time it runs. Python's standard library serves the JSON API and SQLite data. Three.js is installed in `node_modules`; a small React 19 layer is loaded from esm.sh for the archive, SI disclosure, and telemetry card. Node.js 18+ is used by the local server to proxy a fixed allowlist of NASA textures and GLB models with normal TLS certificate validation. The browser therefore needs internet access for React and NASA's hosted media.

## Included

- SQLite `artifacts`, `sources`, and `artifact_sources` tables.
- JSON endpoints under `/api`: artifact search and filters, artifact detail, source catalogue, summary metrics, and create/update/archive operations.
- Starter records transcribed from NASA's 2012 lunar artifact catalogue, with record-level source links and explicit unknown locations.
- Mars records identify named landing regions without inventing coordinates.
- Spirit/Opportunity, Perseverance, Ingenuity, Mars Odyssey, MRO, and MAVEN load NASA GLB assets in the interactive Three.js viewer. Curiosity uses NASA's hosted interactive viewer because its current official 3D resource is distributed as ZIP packages rather than a browser-ready GLB; that embedded viewer does not expose this app's WebXR controls.
- The orbital overview and Moon/Mars comparison are interactive Three.js scenes. They try NASA/JPL planet maps and NASA/GSFC LRO lunar maps first, then fall back to Solar System Scope maps based on NASA imagery and elevation data when a host blocks browser texture access.
- The orbit distances and planetary radii are compressed for the dashboard view. Planet textures are visual references, not scientific data products; source hosts note that some maps are representative or aesthetically processed. The NASA assets need an internet connection in the browser.

## Database notes

The initial lunar records follow the 2012 NASA catalogue. That catalogue is an older reference and should be checked against newer official data before a public judging submission. `Missing` records have no plotted coordinate; the app keeps unknown locations unknown. The catalogue says the Apollo 11 and Apollo 16 ascent stages were left in lunar orbit and later impacted the Moon at unknown locations, so these are not represented as identified surface hardware.

SQLite stores user-created records locally. Back up `last-known-position.sqlite3` to preserve them. Deleting a record through the API archives it (`active=0`) instead of erasing it.

## API examples

- `GET /api/health`
- `GET /api/artifacts?world=Moon&q=Surveyor`
- `GET /api/artifacts/apollo-11-descent`
- `GET /api/sources`
- `GET /api/metrics`
- `POST /api/artifacts` with JSON fields `name`, `mission`, `body`, `world`, and `status`
- `PATCH /api/artifacts/{id}`
- `DELETE /api/artifacts/{id}` to archive a record

## Mission hardware VR viewer

The rover scene includes a NASA hardware selector for the Spirit/Opportunity rover, Curiosity, Perseverance, Ingenuity, Mars Odyssey, Mars Reconnaissance Orbiter, and MAVEN. NASA GLB assets are streamed from the NASA 3D Resources collection into the Three.js viewer and can be inspected with mouse orbit/zoom or WebXR on a compatible headset and browser. Curiosity uses NASA/JPL’s interactive embedded model because NASA currently publishes the newer MSL asset as ZIP packages rather than a browser-ready GLB. Model-source and mission-media links are attached to the viewer. Solar System Scope VR is used as interaction inspiration; this app does not embed or redistribute its software.

## SI disclosure

This project uses SI assistance for code, interface copy, and development. The React disclosure dialog and `/api/artifacts` metadata make that assistance visible in the application and data. The project does not include SI-generated images, videos, or audio. Mission imagery and 3D models are fetched from linked NASA sources; verify source credits and usage guidance before a public submission. Telemetry figures are illustrative sample values, not live mission telemetry or weather readings.


## Cinematic planet and VR view

The solar-system scene and Moon/Mars comparison use NASA/JPL maps served through a fixed local allowlist endpoint so the browser can apply them as 3D textures without cross-origin failures. The scene now uses lower ambient fill for a clear terminator, subtle limb atmospheres on Venus/Earth/Mars, a layered solar corona, and closer camera framing when a planet is selected. The solar-system scene exposes a WebXR entry control where the browser and headset support immersive VR; unsupported browsers hide the inactive control. Pointer cursors are hidden over the 3D canvases.

## Independent archive workspaces

Artifact catalogue sections include Recent discoveries, Brief history, Mission hardware, rover records, and Lunar missions. The hardware inventory offers direct selection of the remote NASA 3D rover/orbiter models while keeping the Three.js viewer in the catalogue. Evidence, Stories, Settings, and Profile have separate sidebar views. The source-led Storyteller assembles a narrative from the selected archive record and citations; its speak/stop controls use the browser's built-in speech synthesis. It does not call a hosted LLM or upload audio. Planet surface textures and auto-rotation can be toggled in Settings. The solar-system Sun uses a rotating Solar System Scope photosphere texture with a layered luminous corona; the texture pack notes its imagery is based on NASA data (https://play.solarsystemscope.com/textures/).

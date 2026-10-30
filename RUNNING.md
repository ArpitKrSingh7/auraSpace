# Running the AuraSpace website

Run commands from the repository root. Keep the single private environment
file at root `.env`; do not commit it or model weights.

## Website only

Use Node.js 24+ and the repository's pnpm version (12.8.1 on this machine):

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. Projects save in this browser. Create a room, add
furniture, select/drag/rotate pieces, and switch between inside, overview and
floor plan. Click a wall or empty room area to deselect. Tap a door/window or
use the Doors and windows toolbar button to open, close or set its angle.

Export JSON to keep a portable backup. Browser-local saving is not cloud sync.

## Enable photo analysis locally

Add to root `.env`:

```dotenv
VISION_SERVICE_URL=http://127.0.0.1:8000
```

If the vision environment and pinned weights are already prepared, skip
installation/downloads. Otherwise:

```bash
python3 -m venv .artifacts/vision-venv
.artifacts/vision-venv/bin/pip install -r services/vision/requirements-depth.txt
.artifacts/vision-venv/bin/python services/vision/scripts/download_models.py --include-depth
```

Keep the web process running and start only vision in another terminal:

```bash
bash scripts/vision-local.sh
```

There is no need to start the API, worker, database, Redis, Expo or an emulator
for this flow. Reuse existing services instead of starting duplicates. Stop a
host process with Ctrl+C in its terminal.

Upload a room photo through Room from photo. Furniture detection and room depth
run together. Check the numbered boxes, uncheck incorrect detections and use
Mark missing item to identify something the model missed. Enter approximate
room width and length in metres or feet if known, then choose Build my room.
The selected furniture is automatically sized and positioned in the draft in one
undoable step. Move, rotate and resize it in the editor.

When raw floor depth is supported, object surfaces are backprojected and
projected vertically onto the floor. Their footprints extend the partial floor
crop so furniture is not discarded outside the initially visible floor patch.
Without supported depth, the UI labels an image-composition starting arrangement
as a guess. Measurements are still needed to establish scale. Automatic opening
and ceiling recovery and multi-view fusion remain unfinished.
A single ordinary photo does not establish all hidden boundaries or exact
physical dimensions. Invalid/unsupported depth returns insufficient evidence
instead of fixed placeholder corners. Metric depth and a display color map
are distinct; the fitter consumes raw metric values.

## Hosted website

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the Vercel Services setup, Large
Functions opt-in, pinned model provisioning and the optional complete Docker
backend. For a custom site domain, set `NEXT_PUBLIC_SITE_URL` and redeploy.

The active project is website-first. Archived mobile source and restoration
notes are in [.depreciated/README.md](.depreciated/README.md). APK installation,
Expo startup and Android builds are outside the active setup.

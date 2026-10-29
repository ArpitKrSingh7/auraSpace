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

Upload a room photo through Room from photo. Review detected furniture; build
and review the partial room draft. Optionally mark a known floor distance or
enter measured dimensions, then explicitly apply the draft. Height and
openings can be edited manually. Big-LaMa supplies learned removal when its
verified checkpoint is configured; the UI identifies approximate fallbacks.

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

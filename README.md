# AuraSpace

Android room planning with a shared scene engine, a private processing backend, and a Next.js web companion. Capture or import photos, review furniture and removal masks, keep pieces in a tray, arrange them in three views, and export an editable project with its photos.

Start with [RUNNING.md](RUNNING.md) for the complete run guide, required environment variables, local Redis/database settings, and Supabase Storage setup. The only environment file is the root `.env`; the clean-checkout template is in that guide. Supabase Storage is the default.

For Vercel and the full hosted backend, see [DEPLOYMENT.md](DEPLOYMENT.md): the Python dependency-index fix, Large Functions opt-in for the reported size limit, automatic model provisioning, and the complete Docker deployment alternative are documented there.

**Status:** installable Android preview with newer source changes awaiting the postponed APK rebuild. Photo-to-room source now fits a correctable partial floor/wall shell from raw metric depth, with known-length scale calibration and explicit review. Physical-phone behavior and independent real-room accuracy remain acceptance gates. See [reconstruction method and limits](docs/reconstruction-method.md), [the plan audit](docs/implementation-audit.md), and [Android setup](docs/android-setup.md).

## Quick start

Use Node.js 24+, pnpm 12.8.1, Python 3.11+, and Docker for the local platform.

```sh
pnpm install
pnpm db:generate
# Android: use a development build, or install the locally generated preview APK.
pnpm dev:android
# Web companion; manual planning needs no server.
pnpm dev
```

The preview APK is generated at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. The reviewed copy is placed in `artifacts/auraspace-android-preview.apk` after verification. Build artifacts and downloaded model weights are intentionally ignored by Git.

## Local processing backend

```sh
# Configure root .env using RUNNING.md, then validate it.
pnpm check:env
docker compose -p auraspace up -d database redis
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
python3 -m venv .artifacts/vision-venv
.artifacts/vision-venv/bin/pip install -r services/vision/requirements-depth.txt
python3 services/vision/scripts/download_models.py --include-depth
```

Run these in separate terminals from the repository root:

```sh
bash scripts/vision-local.sh
node --env-file=.env --import tsx apps/api/src/index.ts
node --env-file=.env --import tsx apps/worker/src/index.ts
```

In Android Settings, use `http://10.0.2.2:4000` for the standard Android emulator, or your laptop's reachable LAN address for a phone. The development/preview build allows local HTTP; production builds require HTTPS. Leave the server blank to plan offline.

Alternatively run the application services in Docker, with Supabase Storage:

```sh
docker compose -p auraspace up --build -d
```

This compose configuration is for local development with example credentials. Set `API_BIND_ADDRESS=0.0.0.0` when deliberately exposing the local API to a phone on your LAN. Production accounts use the documented OIDC configuration and private S3-compatible storage.

The single compose file uses Supabase Storage directly. Fill the three root `.env` Supabase settings before starting API/worker services. No additional compose override is needed.

For server-backed operations in the web companion, set `VISION_SERVICE_URL=http://127.0.0.1:8000` in `.env` and restart Next.js. The web editor retains its existing browser-local project format; it does not silently share the native SQLite database or cloud workspace.

## Editor behavior

- **Room from photo → Build room from photo** on web, or **Build room from photo → Review processing result → Review room draft & scale** in native source, produces an approximate visible-floor shell. Check the solid observed-wall and dashed view-limit edges, optionally tap a measured floor reference, then explicitly choose **Use this room draft**. Furniture keeps its dimensions and poses; existing measured values take precedence. No metric depth or stable floor means an honest insufficient-evidence result, with no fabricated corners.
- This first fitter uses a rectangular room prior. Room height and automatic door/window extraction are not recovered yet; use the existing numeric/opening controls. Independent measured-photo evaluation and multi-view fusion remain pending.
- The shared library includes wardrobes/almirahs, dressing tables, wall mirrors, study desks, bedside tables, bookshelves, shoe racks, TV units, split ACs, ceiling fans and refrigerators alongside the original furniture. Search aliases such as **almirah**, **AC**, and **study table**, or filter by room/use.
- Floor, wall and ceiling mounting are explicit. Wall fixtures have an editable bottom height; ceiling fixtures follow room height. Collision and walking checks account for vertical separation. Dimensions begin as editable priors.
- Custom Box and Board presets cover unusual objects, including thin boards down to 1 cm. Adding a library category does not automatically add a trained detector class.

- **Room → Doors & windows** in the web editor supports multiple openings with independent wall, offset, size, sill height, hinge side, inward/outward swing and opening angle. The Android room sheet exposes the equivalent controls.
- Select furniture and drag its round rotation handle, or use **Rotate** for an angle control and precise degree entry. A completed drag is one undoable edit. Taps select without needing to move the item.
- Open door/window leaves are visible in the scene and plan exports. Clearance feedback uses approximate footprints; these controls do not automatically infer hinges or hidden structures from photos.

- **Add furniture** explicitly opens the tray. Select a piece, tap the floor, and confirm placement. Long-press tray dragging has a tap alternative.
- Selecting or moving a placed item shows compact actions. **Details** explicitly opens measurements, position, identity, locks, and finish controls.
- Inside, overview and floor plan use the same scene. If native 3D cannot initialize, the editable floor plan is available.
- Native layouts share physical furniture dimensions and keep independent placements. Fixed fixtures retain their locked pose across layouts.
- Originals stay in app document storage. Processing produces reviewable proposals and never replaces current measurements or layouts automatically.
- Source dimensions retain per-axis provenance. Category defaults, model estimates, calibrated estimates and legacy manual corner guides remain distinct from measurements.
- Native portable ZIP exports include the scene, referenced media, and SHA-256 integrity records. SVG and current-view sharing are also available.

The web companion supports JSON/SVG/PNG exports, keyboard editing, and browser-local persistence. Its legacy layout snapshots retain their original format; import/export between the two clients is not presented as automatic cloud synchronization.

The 29 October editor changes require rebuilding/reinstalling Android to appear in the APK. The existing 25 October preview artifact has not been replaced by these source changes.

## Verification

```sh
pnpm typecheck:all
pnpm test
PYTHONPATH=services/vision python3 -m unittest discover -s services/vision/tests
node --env-file=.env --import tsx scripts/verify-platform.ts
# Requires the local worker and configured vision models above.
node --env-file=.env --import tsx scripts/verify-processing.ts
```

`scripts/verify-ui.cjs` runs the web interaction regressions with Playwright. `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point to an existing installation. Native acceptance steps and the tested build environment are documented separately.

[Completion roadmap](docs/completion-roadmap.md) · [Architecture](docs/architecture.md) · [Capture guide](docs/capture-guide.md) · [Evaluation](docs/evaluation.md) · [Demo](docs/demo-script.md)

## Repository cleanup

Superseded Docker configurations and unused UI components are retained in [.deprecated](.deprecated/README.md), outside active builds. Shared domain code, tests, evaluation evidence and model/build artifacts remain in their existing locations.

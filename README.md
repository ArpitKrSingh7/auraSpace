# AuraSpace

A website for planning room layouts before moving furniture. Upload a room
photo, review furniture and an approximate room draft, then arrange editable
assets in synchronized inside, overview and floor-plan views.

The active product is the website. The Expo/Android prototype is preserved in
[.depreciated/mobile](.depreciated/mobile), outside active builds and workspace
installation. The removed documentation remains in Git history.

## Run the website

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. Manual room planning needs only the web app. For
photo processing, follow [RUNNING.md](RUNNING.md). Hosting and model provisioning
are covered in [DEPLOYMENT.md](DEPLOYMENT.md).

## What is implemented

- Room dimensions, finishes, multiple doors/windows, hinge direction and angles.
- Tap furniture to select it; click walls or empty room areas to deselect.
- Tap a door/window or use the Doors and windows toolbar button for Open,
  Close and exact-angle controls, including in the inside view.
- Furniture placement, drag rotation, editable sizes, locks, undo/redo,
  alternatives, browser-local saving and JSON/SVG/PNG export.
- A 19-category asset library, including common Indian household items,
  wall/ceiling fixtures and custom boxes/boards. Library dimensions are priors.
- Furniture detection, classical image-processing tools, reviewed removal,
  and a partial metric-depth floor/wall draft with known-length calibration.
- Branded favicon, sharing image, page metadata and home-screen manifest.

Room drafts remain approximate and user-correctable. Automatic opening/ceiling
recovery, joint multi-photo reconstruction, independent real-room accuracy,
website accounts/cloud restore and physical-device interaction validation are
unfinished. The current website stores projects in its browser; deploying the
optional cloud backend does not automatically connect those projects to it.

## Required academic components

| Component | Implementation |
| --- | --- |
| Image processing | Grayscale, contrast/CLAHE, edges, contours, histograms, reviewed masks and removal composition |
| Computer vision | COCO Mask R-CNN furniture detection, learned indoor metric depth and geometric floor/wall fitting |
| Computer graphics | Procedural furniture/room meshes, cameras, lighting, picking, transforms, hinged leaves, collision checks and 2D/3D views |

The frontend uses Next.js, React, TypeScript, Three.js, React Three Fiber and
Zustand. Python, NumPy, OpenCV, Torch/Torchvision and Transformers provide
server inference. The pinned model manifest records exact weights and hashes.

`apps/api`, `apps/worker`, `packages/backend` and their contracts remain optional
infrastructure for future website cloud jobs/accounts. The ordinary web photo
flow calls the Python service through Next.js and needs neither PostgreSQL nor
Redis. Native dependencies and unused AWS SDK packages were removed from the
active dependency graph.

## Check the source

```bash
pnpm typecheck
pnpm test
pnpm verify:reconstruction
```

The scene interaction tests run actual raycasting and event propagation with
GPU drawing stubbed. They complement browser/phone testing; they do not certify
all visual behavior. Tests use synthetic/mocked inputs unless explicitly marked
as live verification. Model accuracy requires independently measured rooms.

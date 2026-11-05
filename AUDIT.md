# AuraSpace implementation and reconstruction audit

Reviewed 5 November 2026 against the working tree, including the existing
uncommitted multi-photo implementation. This is a source, contract and regression
audit; it is not a measured-room accuracy certification. Existing edits were
preserved. No deployment, model replacement, training or cloud migration was done.

## Assessment

The project implements a useful editable planner with photo-assisted suggestions.
It does **not** yet implement a validated image-to-room scan. The largest missing
pieces are the active calibration/review workflow, reliable boundary semantics,
per-dimension evidence, and independent real-room evaluation. A plausible rendered
room can conceal substantial geometric error.

The plan's strongest decisions should remain: raw metric depth is separate from
display depth; relative/heuristic depth cannot generate dimensions; hidden walls
are uncertain; furniture defaults are editable; inpainting is not measurement;
manual planning remains usable; unsupported views remain references. Code and
synthetic tests substantiate those safeguards, with the qualifications below.

## Feature coverage

“Implemented” means a reachable code path, not validated accuracy or production
reliability. “Partial” means the plan promises more than the active flow provides.

| Feature | Current evidence | Status / missing requirement |
| --- | --- | --- |
| Manual room creation and samples | `app/page.tsx`, catalog/store | Implemented; illustrated photo samples are explicitly predefined, not inference |
| 1–5 photo import | `PhotoUploadDialog.tsx` | Implemented for JPG/PNG/WebP; 8 MB / 20 MP checks, resized JPEG copies; no HEIC/RAW support |
| Original preservation | Upload redraws to a 1280-side canvas and encodes JPEG | Partial: retained source is a normalized preview, not the original file/EXIF/calibration |
| Quality guidance | `multi_view.quality`, `/validate`, upload tips | Partial: batch sharpness/light advice exists; single-view upload does not call `/validate`; no overlap coaching |
| Grayscale, contrast, Sobel | `vision-core.ts`, Analysis lab | Implemented in browser; browser contrast is around 128, Python contrast is around image mean |
| CLAHE, contours, histogram | Python `/process` | Backend only; no web controls/histogram display; morphology is a helper, not an exposed operation |
| Furniture detection | Mask R-CNN / browser COCO-SSD | Six mapped categories: chair, sofa, plant, bed, table, fridge; not all 19 library categories |
| Segmentation and cutouts | `inference.py`, `masks.py` | Available in Python/cloud; active web parser keeps boxes/color, discards segmentation |
| Detection correction | Review checkboxes and manual boxes | Partial: no direct relabel/edit/delete of existing observation boxes; manual menu covers only six types |
| Metric depth | `depth.py`, pinned manifest | Implemented adapter; indoor learned prior, real-room accuracy unmeasured; no depth-review UI |
| Floor/wall fitting | `room_reconstruction.py` | Partial visible Manhattan rectangle; no semantic floor/wall segmentation, ceiling, nonrectangular shell or opening recovery |
| Structural review | `RoomReconstructionReview.tsx` | Partial: furniture boxes, size fields and layout thumbnail; no floor-corner/observed-wall correction overlay |
| Two-point measured floor reference | `calibration.ts`, `reconstruction.ts` | Shared implementation/test only; active build flow uses `buildPhotoLayout`, not `reviewedRoomForWeb` |
| Camera calibration | Optional intrinsics on `/analyze` | API only; browser never supplies them; batch captures do not accept them; no distortion correction |
| Furniture dimensions and placement | `furniture_layout.py`, `photo-layout.ts` | Visible-surface PCA, category clamps and packing; full object extent/front orientation not established |
| Multi-photo common frame | `multi_view.py` | Experimental RootSIFT + depth Sim(3); no global optimization, dense fusion, texturing or real-room benchmark |
| Removal | Python LaMa/OpenCV and browser fill | Implemented approximate previews; web removes all detections using expanded boxes, not reviewed instance masks |
| Removal-mask editing | `reviewed_mask`, shared mask schemas, worker | Backend/domain only; web proxy does not accept masks and web UI has no paint/erase/selection review |
| 2D/3D scene and furniture library | SceneWorld/SceneCanvas, scene-assets | Implemented procedural geometry, not recovered meshes or photorealistic replicas |
| Doors/windows | Opening controls/settings/geometry | Manual editing and hinged leaves implemented; automatic proposals absent |
| Fit, overlap and clearance | Legacy geometry + scene-domain spatial logic | Rotated bounding-footprint/vertical checks and approximate clearance; not full mesh collision or accessibility certification |
| Undo, alternatives, JSON/SVG/PNG | Store, validation, export | Implemented; photo build is one room/items undo step; photos/reanalysis are not restored by that history |
| Durable persistence | Synchronous localStorage | Partial for multiple photos; quota failures warn, but edits are then memory-only |
| Accounts, jobs and private storage | Optional API/worker/backend | Code exists separately; active browser editor is not cloud-synced |
| Model provenance/deployment | Model manifest, startup, Docker/Vercel configs | Hash-pinned weights; deployment readiness still needs actual cold/concurrent inference checks |
| Evaluation | Synthetic tests, smoke reports, fixed-IoU script | Actual detection benchmark report is `not_evaluated`; no measured depth/room/layout accuracy report |

## Critical geometry and CV findings

### 1. Room editing and scale calibration are conflated in the active flow — high

`src/services/photo-layout.ts` derives scale from requested room width divided by
the proposal width, then scales furniture and sometimes the other room dimension.
The proposal width is a **visible floor/furniture extent**, not necessarily a
wall-to-wall width. A 2 m visible patch inside a 4 m room does not prove that the
depth model underestimates everything by a factor of two. This flow can double
objects, then hide the error with category clamps.

Supplying both dimensions also produces different X/Z scales. A rotated rectangle
under nonuniform scaling becomes a parallelogram; converting it back into width,
depth and one yaw is an approximation. Scaling height by `sqrt(sx*sz)` adds an
unsupported assumption. The shared two-point calibration operation is tested,
but it is not invoked by the active furnished-room builder.

**Required:** expose two points on an observed floor with a measured distance,
retain the calibration evidence, distinguish scaling observed geometry from
extending a room boundary, and keep measured furniture dimensions independent.
Show explicit per-axis sources and a reviewable before/after preview. Preserve
the existing manual-size path as a planning approximation. This audit adds a
warning; it does not claim that warning solves the calibration problem.

**Acceptance:** known-length synthetic and real fixtures calibrate without
stretching unrelated items; changing a hidden wall does not rescale a measured
bed; rotated footprints remain geometrically consistent; measured sources
survive save/import/rebuild.

### 2. Camera/depth assumptions need an explicit contract — high

The single-photo API accepts `fx,fy,cx,cy`, but the UI normally assumes a 60°
horizontal FOV and square pixels. The importer drops camera metadata; batch
registration uses the same assumption. Digital cropping, ultra-wide lenses,
lens distortion, steep camera pitch/roll and different camera modes can change
the reconstructed shape. A single scale reference cannot undo all of them.

The optical-Z convention in the fitter is defensible: upstream Depth Anything
V2 converts Hypersim ray distance to camera-axis depth in its dataset loader.
Keep that convention explicit in any future dataset/model adapter; do not feed
raw Hypersim range or a colorized PNG into this fitter.
Sources: [upstream Hypersim conversion](https://github.com/DepthAnything/Depth-Anything-V2/blob/main/metric_depth/dataset/hypersim.py),
[OpenCV projection/calibration reference](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html).

**Required:** one oriented-image coordinate contract for K, distortion, crop,
resize, masks and depth; per-photo calibration in batch requests; tests for
EXIF rotations/mirrors, portrait rounding and crop offsets. Store calibration
source, model/checkpoint, image hash and processing revision with each proposal.
An EXIF focal length alone is not a complete calibrated camera.

### 3. A plane fit is not semantic room understanding — high

The fitter removes detected furniture boxes, selects lower-image samples and
looks for a plausible near-horizontal plane with the camera above it. Those
checks are valuable, but missed beds/tables/platforms can still supply a false
floor. Boxes also exclude useful floor around chair legs. Vertical object faces
can pass as walls. A low residual measures agreement with predicted depth,
not agreement with the physical room.

The algorithm intentionally assumes an upright camera, roughly level floor and
rectangular Manhattan layout. It cannot represent alcoves, L-shaped rooms,
stairs, sloped ceilings or curved walls. `_limits` distinguishes supported wall
edges from visibility limits, but the active editor ultimately renders a full
rectangle. Furniture priors can expand it; multi-view fusion marks all edges as
view limits. Those rectangles are planning envelopes, not measured room outlines.

**Required:** visualize supported floor regions, observed walls and unknown
edges separately; let the user reject/correct the floor and boundary; add
semantic support or other independent evidence only after benchmarking it.
Keep unknown height/openings absent rather than fabricating proposals. Include
no-floor, elevated bed/platform, mirror, glass, rug and clutter cases in tests.

### 4. Furniture size and orientation need independent evidence — high

`populate_room_proposal` projects visible object surface depth into the floor
frame. This is better than projecting the image-box center through a floor
homography. However, a partial surface does not establish the full footprint,
object center, back face, height or front direction. PCA is unstable for nearly
square/symmetric masks and perspective-truncated objects. An external contour
also loses mask holes/disconnected components and can include background depth.

The builder clamps beds/chairs/tables to ranges, substitutes some cropped-table
defaults and sometimes snaps/re-packs single-view poses. These are useful planning
heuristics, but the legacy item has only `estimated/measured/sample`; it cannot
explain whether each dimension was projected, clamped, assumed or user-entered.
Manual/unsupported items have no learned mask/depth pose in the current flow.

**Required:** per-axis value/source/evidence, truncation and pose-confidence
flags, visible-surface bounds separate from full-object priors, front-direction
review and explicit disclosure of packing displacement. Preserve observed pose
as an alternative to “arrange to fit.” Avoid hardcoded “Study table” naming for
every COCO dining-table observation.

### 5. Multi-photo alignment needs global validation — high

Current mutual descriptor matches, epipolar filtering, 3D residuals, spatial
spread, reprojection and floor checks are useful rejection gates. They do not
establish correctness for repeated furniture, repeated tiles, mirrors, people,
moving objects or low texture. Similarity fits can absorb depth-scale bias.
Breadth-first transform composition accumulates error; pairwise scale limits do
not constrain the composed scale relative to the anchor. There is no loop-closure,
cycle consistency or joint pose/depth/intrinsics optimization. Pure rotation and
planar scenes need explicit degeneracy handling, not just a successful matcher.

Cross-view instance matching currently uses category and center proximity.
The audit fixes merging two observations from the **same** image, including
transitive replacement by higher-score observations. Distinct similar objects
across photos can still merge; the same object can still remain duplicated.

**Required:** record per-view transforms and uncertainty/provenance, check
accumulated scale and anchor-floor agreement, reject contradictory loops, use
one-to-one instance assignment with geometric/size/appearance evidence, and
surface duplicate merge/split controls. Keep unregistered coordinates isolated.
Budget failure must retain the strongest completed draft.

Sparse camera registration is only one stage toward a textured reconstruction.
Dense stereo/fusion, meshing and texture mapping would be separate features.
[COLMAP's documented pipeline](https://colmap.github.io/tutorial.html) explicitly
separates sparse reconstruction from dense reconstruction. Introducing it or a
new learned reconstruction model should be a measured experiment, not a claim
that 3–5 arbitrary photos guarantee a complete room.

### 6. Active review is incomplete — high

The current review offers selection, manual boxes, room width/length and a
furniture layout thumbnail. It cannot correct a floor plane, wall corner,
camera, instance mask, detector category or opening candidate. The capture tips
recommend measuring a floor segment, but there is no point-picking calibration
control. Unchecking every detection prevents a geometry-only build when any
observations exist. Reanalysis preserves manual boxes but uses unstable model
indices; locked old items may refer to a different observation after rerunning.

**Required:** make observation identity stable across runs or detach old
provenance explicitly; offer label/box correction and an empty-room build;
wire the shared calibration operation into the actual UI; protect reviewed
edits on reanalysis. Do not call code “implemented in the website” merely
because its domain function has passing tests.

### 7. Removal is a visualization workflow with incomplete review — high

The web Analysis lab passes all detections to removal. The proxy accepts boxes
only; it strips unsupported fields and requires at least one box. Python and the
optional worker support reviewed masks, but the web path does not. Expanded
rectangles may erase floor, nearby furniture or fixed objects. LaMa can invent
plausible but false wall/floor details, and large OpenCV removals can smear.

This audit fixes outside-mask changes caused by browser JPEG transport: service
output is recomposed over the browser source raster using the returned mask and
exported as PNG. Browser fill also emits PNG. Preservation is relative to that
normalized raster, not the user's original high-resolution file. Empty/full
masks are now rejected before either LaMa or OpenCV inference. The UI shows the
actual removal method and labels synthesized surfaces.

**Required:** explicit per-item removal selection, raw/clean mask overlays,
paint/erase, fixed-object protection, mask expansion preview, undoable review,
and consistent mask validation through proxy/Python/contracts. Python currently
accepts loosely typed mask dictionaries; malformed nested types and out-of-image
coordinates need comprehensive HTTP 422 coverage. Bound mask complexity as well
as image dimensions. Never reuse removal output as reconstruction evidence.

## Reliability, storage and other product gaps

| Priority | Finding and consequence | Required completion evidence |
| --- | --- | --- |
| High | Batch `budget_s=125` is checked between calls. Inference/matching/decode cannot be interrupted. Browser fallback can start more long requests after a timeout. | Deadline-aware staged work or cancellable worker jobs; request cancellation, bounded retries, stage timings and partial-result recovery |
| High | Per-model locks do not bound all cross-model concurrency or request queue growth. Direct Python uploads may be much larger than browser previews. | Peak RSS and p50/p95 for cold/warm 1/3/5 photos, concurrent users, realistic aspect ratios and failures; explicit admission/backpressure limits |
| High | `localStorage` serializes every project and photo synchronously on writes; quota failure warns but does not make data durable. One invalid saved project makes `getStoredState` discard the entire parsed collection. | IndexedDB blobs/metadata, debounced durable writes with flush, quota estimate/recovery, per-project validation/quarantine, multi-tab conflict tests |
| High | Uploaded full-resolution originals and metadata are discarded. Repeated JPEG/canvas conversions lose reproducibility. | Separate original/analysis/display artifacts with hashes, resolution and coordinate transforms; clear storage policy |
| Medium | Same-group unlocked model suggestions can replace user moves on rebuild; room/history and photo analysis histories differ. | Explicit accepted-edit/rebuild policy; transaction tests for reanalysis, delete, import, saved layouts and undo |
| Medium | Existing opening constraints can make a smaller photo draft invalid. Default room openings/height are not inferred. | Explain conflicts before apply, preserve measurements, mark defaults and show all placement warnings including retained items |
| Medium | Coarse collision/clearance and procedural models can be visually convincing but physically inaccurate. | Tests for rotation, mounting/elevation, door/window sweep, oversized items, narrow passages; retain fit disclaimers |
| Medium | Cloud APIs/jobs are implemented separately, not integrated with the website. | Auth/ownership, revision conflicts, restore/fork, retries/cancellation and artifact lifecycle tested end to end before claiming sync |
| Medium | `/health` connectivity is not model readiness. Token protection differs between private services and the Caddy deployment. | Verify actual deployment boundaries, model load/forward readiness, request/body/response limits, redacted errors and rate limits; CORS is not authorization |
| Medium | Python libraries are mostly minimum-version requirements; browser detector downloads weights at runtime. | Reproducible dependency constraints, supported Python/Node version checks, artifact/version/license inventory and offline/CSP tests |
| Medium | Three view modes, touch editing, dialogs, unit switching and exports need real browser/device coverage. | Desktop and phone browser runs with persistent reload, cancellation, keyboard/touch access, long labels and real WebGL; synthetic scene tests cannot prove all of these |

The existing demand-driven Three.js render loop, bounded device-pixel ratio,
lazy browser model loading, model singleton caches and bounded RANSAC samples
are already useful optimizations. Profile before replacing them. Do not remove
uncertainty checks, reduce detection thresholds blindly or increase model size
as a substitute for geometric validation.

## Changes completed in this audit

1. Added opt-out detection artifacts for web/batch use. Compact inference keeps
   polygons, color, boxes and geometry while skipping unused mask PNG encoding
   and thumbnail construction. Existing artifact-consuming clients retain the
   default full response.
2. Vectorized furniture-class filtering instead of repeated tensor `.item()`
   synchronization; detector resizing now uses `MAX_IMAGE_DIM`; serialized
   detector forward passes to bound simultaneous detector activations.
3. Fixed same-view/transitive multi-view duplicate merging; limited fused poses
   to the shared 100-pose contract with a warning; made invalid/no-evidence
   fusion fall back to reference views rather than claim successful alignment.
   Also tightened final RANSAC support and positive-depth reprojection checks.
4. Scoped photo-suggestion replacement to the current group and preserved
   manual observations, unrelated groups, measured items and locked items.
   This intentionally changes the old test that expected every prior photo
   suggestion to be deleted when switching to an unrelated photo.
5. Pruned layout candidates that cannot beat the best cost, returned immediately
   for a collision-free zero-cost target, and memoized review layout calculation.
6. Replaced floating-point mask blending with exact masked copies; validated
   empty/full selections before model choice; restored browser source pixels
   outside the returned mask and switched final removal output to PNG.
7. Made removal discover server-only `VISION_SERVICE_URL` configuration through
   the health route, matching the detector's behavior. Surfaced removal method
   and synthesis limitations in the Analysis lab.
8. Included refrigerators in evaluation/subset preparation and indexed truth
   boxes by image/category to avoid scanning the whole dataset per prediction.
   This evaluator remains fixed-IoU precision/recall, **not COCO mAP**; it does
   not implement standard COCO crowd/ignore semantics.
9. Corrected stale MiDaS, contour-UI, multi-photo status and original-file claims
   in UI/docs, and distinguished backend-only features in `PLAN.md`.

An isolated synthetic 1280×960, 25%-mask composition benchmark (10 repeats)
produced identical pixels: median 18.18 → 6.90 ms and traced peak allocations
54,101,608 → 4,915,656 bytes. This is approximately 2.6× faster and 91% fewer
traced allocations **for composition only**, excluding model/browser memory.
Other changes remove identifiable redundant work but have no whole-pipeline
latency claim.

## Evaluation that must exist before accuracy claims

Start with a documented pilot of independently measured rooms, then freeze a
larger held-out set before tuning. Include different cameras, portrait/landscape,
small/large rooms, repeated objects, clutter, dark scenes, mirrors/glass, partial
occlusion, no visible floor, irregular rooms, differing view overlap and camera
movement. Split by physical room, not by photo, to avoid leakage. Record image
consent/licensing and dataset/model versions. Synthetic fixtures remain useful
for mathematical correctness but are reported separately.

| Layer | Metrics and evidence |
| --- | --- |
| Detection | Per-class precision/recall and official COCO box/mask AP where applicable; missed/false/repeated items at the actual review threshold; manual correction count |
| Depth | Absolute relative error, RMSE and valid-depth coverage with explicit optical-Z/range conversion; report absolute metric and scale-aligned results separately |
| Structure | Floor normal angle, camera-height error, supported wall distance/angle, floor polygon IoU, observed versus unknown edge coverage, false-floor rate |
| Dimensions | Width/depth/height MAE in cm and relative error per supported axis; no score for hidden boundaries guessed from priors; uncertainty coverage |
| Multi-photo | Registration success/failure rate, false-positive fusion, pose/scale drift, loop error, duplicate precision/recall and fallback rate; account for failed views |
| Furniture layout | Center error, footprint IoU, size error and yaw error with class symmetry; before/after packing displacement and per-axis provenance |
| Removal | Exact unselected-pixel equality at the specified raster, reviewed-mask IoU/boundaries, paired empty/furnished quality where ground truth exists, human review of large removals |
| User outcome | Time to a usable corrected layout, number of corrections, unwanted overwrites, successful export/reload, failure recovery |
| Performance | Cold/warm stage p50/p95, peak RSS/VRAM/browser heap, request/response sizes, 1/3/5-photo latency and concurrent-user behavior |

Set product acceptance thresholds *before* running the held-out evaluation.
Report sample counts, confidence intervals, all failure cases and raw outputs;
do not compress detection, geometric accuracy and registration success into one
“60–75% accurate” number. The existing reports show model execution and isolated
pixel preservation, not room accuracy. `evaluation_report.json` remains honestly
`not_evaluated`.

## Recommended implementation order

1. Finish calibration, evidence/provenance and structural review in the active
   builder; stabilize observation identity and preserve accepted user edits.
2. Wire selected mask review and the missing image-processing controls; migrate
   image persistence to durable blob storage with source/analysis separation.
3. Establish the measured-room benchmark and capture telemetry; use results to
   choose improvements to floor/wall support and instance matching.
4. Add global multi-view consistency and practical time/memory/cancellation
   controls. Compare alternative feature/depth/reconstruction approaches on the
   same held-out data before adopting additional models.
5. Add reviewed openings/height and irregular rooms only when evidence and
   validation support them. Dense textured reconstruction and cloud sync remain
   separate product milestones.

## Verification and limits

The audit added regression coverage for compact detector outputs, exact mask
composition, invalid LaMa selections, same-photo and transitive duplicate
handling, five-view pose limits, invalid-fusion fallback, capture-group
preservation and refrigerator evaluation.

Validated: 110 JavaScript tests, 75 Python tests, all workspace typechecks
(web/API/worker), production build and Python-to-TypeScript reconstruction/calibration integration. The
integration fixture recovered a calibrated visible extent of 5.20 × 4.39 m;
that result describes an analytic fixture, not a scanned real room.

Chromium checks at 1440 px and 390 px passed review/build, preservation of
unrelated furniture, undo/redo, method labeling and removal composition. A mocked
service deliberately changed every output pixel; the browser preserved all
283,200 unselected pixels and changed the 24,000 selected pixels in the 640×480
fixture. This exercises the browser path, not learned removal quality. Test
scripts/logs/screenshots for this run are under `/tmp/auraspace-audit-*`.

No fresh real-room accuracy study, live learned-model benchmark, production
deployment test or full browser/device matrix was performed in this audit.
Optional cloud services were inspected but not started or exercised against a
live database/storage provider. Those limitations remain explicit release work.

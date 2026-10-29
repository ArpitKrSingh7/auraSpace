# AuraSpace: website implementation plan

Updated 30 October 2026. The active product is an intelligent website for 2D/3D
room planning and furniture visualization. The mobile prototype is deferred to
`.depreciated/mobile`; there is no active Expo or APK requirement.

## Problem and user flow

Manual furniture planning can waste space and lead to poor fit. AuraSpace lets
a user enter room measurements or upload a photo, review approximate structure
and detected furniture, then arrange editable assets before moving real items.

1. Create/open a browser-local room or explore a sample.
2. Enter room dimensions, or upload an original room photograph.
3. Review detected items and a partial floor/wall draft; calibrate scale using
   a known floor length or override axes with measured dimensions.
4. Explicitly apply the reviewed room; keep furniture dimensions and poses.
5. Add detected/library furniture, or a dimensioned custom box/board.
6. Place, rotate, resize and lock items in inside, overview or floor-plan views.
7. Open/close doors and windows to examine placement/clearance, save alternatives
   and export a portable project or visual plan.

The room estimate is a correctable draft, not a guaranteed survey. Missing
boundaries remain uncertain; synthesized/inpainted pixels are not measurements.

## Technology

| Layer | Stack and purpose |
| --- | --- |
| Website | Next.js App Router, React and TypeScript |
| Graphics | Three.js, React Three Fiber and Drei; shared procedural assets |
| State | Zustand, browser-local persistence, undo/redo and project export |
| Image processing | Python, OpenCV and NumPy |
| Learned vision | Torch/Torchvision Mask R-CNN; pinned Depth Anything V2 indoor metric model |
| Removal | Pinned Big-LaMa TorchScript model with labelled OpenCV fallback |
| Hosting | Vercel web/private Python service, or Vercel web with Docker-hosted vision |
| Optional later cloud layer | Existing TypeScript API/worker, PostgreSQL, Redis and private Supabase Storage |

The default website needs only Next.js and Python vision. The optional cloud
layer is separate and is not required to demonstrate the three academic
components. `.env` stays private; model files are downloaded and verified from
`services/vision/model-manifest.json` rather than committed to Git.

## Image processing contribution

Implement and expose grayscale conversion, contrast/CLAHE, edge detection,
contours and histogram inspection. Support reviewed selection masks and preserve
unselected source pixels when composing removal output. Keep originals intact
and distinguish model output from approximate fallback processing.

## Computer vision contribution

Use pretrained COCO furniture detection/instance segmentation for supported
categories. A catalog entry does not imply that a detector recognizes it.
Furniture dimensions start from editable category priors unless measured.

For room drafts, backproject raw learned optical-axis depth with camera
intrinsics, or a disclosed 60-degree horizontal-FOV assumption. Exclude detected
furniture, fit a plausible floor using bounded RANSAC, fit supported vertical
walls, align a rectangular Manhattan-room draft and derive its floor
homography. Mark observed wall edges separately from visibility limits.

A two-point measured floor reference calibrates scale. Existing measurements
win unless replacement is explicitly requested. One known length does not
recover hidden boundaries or correct every lens/shape error. The current
fitter omits height and automatic opening proposals when unsupported.

## Computer graphics contribution

Construct procedural floor, walls, door/window leaves and furniture meshes.
Demonstrate camera projection, scene hierarchy, lighting, picking and coordinate
transforms. Synchronize inside/overview/plan representations. Use continuous
furniture rotation, editable dimensions, hinged opening angles, containment,
SAT overlap and approximate clearance feedback. Selection is separate from
placement; background clicks clear selection and pointer captures are released
from their original targets.

## Models and publicly available evaluation data

- COCO supports detection evaluation for the existing furniture classes. It
  does not supply exact dimensions of a user's individual furniture.
- The indoor metric-depth checkpoint is pretrained/fine-tuned externally; its
  exact repository revision and file hashes are in the model manifest.
- SUN RGB-D and Hypersim can support geometry/depth evaluation, with their
  dataset terms, camera calibration and depth conventions checked explicitly.
- Use independent room photographs with tape/laser dimensions to evaluate
  actual capture-to-room error and correction effort.
- Use paired empty/furnished synthetic scenes or reviewed masks for removal
  quality and outside-mask preservation checks.

Do not claim that all models were trained from scratch or that a model smoke
run establishes room accuracy. Retain evaluation fixtures, manifests and
existing vision evaluation scripts/reports.

## Current implementation and remaining work

The editor, expanded household library, image-processing tools, learned-model
adapters, reviewed partial room fitter, scale calibration and deployment
configuration are implemented. Door/window controls are accessible from the
scene and toolbar; geometry settings remain available in Room settings.

Next priorities:

1. Extend the successful deployed detector/depth/removal synthetic smoke checks
   to real captures, cold starts, memory, errors and retries. Exercise
   interactions on desktop and phone web.
2. Compare room drafts with independent measured rooms. Report errors, failure
   cases and correction effort before claiming reconstruction accuracy.
3. Improve supported wall/corner recovery and add reviewed opening detection,
   ceiling/height recovery and irregular-room proposals where evidence permits.
4. Add multi-photo alignment/fusion only with recoverable camera poses and
   sufficient overlap; unrelated depth maps cannot simply be averaged.
5. If required, connect the website to the optional account/cloud-job backend
   and implement conflict-aware project restore. Browser-local rooms do not
   become cloud-synced merely by deploying those services.
6. Finish the evaluation report, demonstration and presentation against actual
   implementation evidence. Mobile remains deferred until explicitly resumed.

## Verification and deployment

Use `pnpm typecheck`, `pnpm test` and `pnpm verify:reconstruction`. Scene tests
exercise actual Three.js raycasting and Fiber event propagation with GPU drawing
stubbed. Python tests cover geometric fixtures, route-function contracts,
mask composition and model provisioning. None of these replaces live browser,
physical-room or inference-performance validation.

Start and hosting instructions are in `RUNNING.md` and `DEPLOYMENT.md`. Do not
start the full optional stack for ordinary website work. Keep legacy reference
material out of active builds and preserve mobile source in its archive.

# Photo-based room reconstruction

`POST /analyze` with `include_room: true` produces a **correctable, partial
visible-floor draft** when the source photograph has sufficient learned metric
depth. It does not certify the full room dimensions. Furniture detection and
depth estimation run on the original oriented image, before any removal or
inpainting. Synthesized pixels are never reconstruction evidence.

The geometry implementation is
[`services/vision/app/room_reconstruction.py`](../services/vision/app/room_reconstruction.py).
It uses NumPy and OpenCV, without loading another model or starting a service.

## Inputs and coordinate convention

The function `reconstruct_room(image, depth, depth_units, boxes, intrinsics)`
accepts a BGR image, a source-sized H×W depth array, furniture boxes expressed as
`[x, y, width, height]` in source pixels, and optional calibrated camera
intrinsics `{fx, fy, cx, cy}`. `/analyze` accepts the same optional `intrinsics`
object. Calibration must refer to the already oriented source image, including
any crop or resize. An arbitrary EXIF focal length is not a pixel calibration.

The pipeline assumes that the configured indoor metric-depth model returns
**optical-axis Z in metres**, rather than Euclidean distance along the ray.
For each valid depth pixel `(u, v, Z)`, backprojection is:

```text
Xcamera = (u - cx) * Z / fx
Ycamera = (v - cy) * Z / fy
Zcamera = Z
```

Camera axes are right, down, and forward. Model output retains its metric scale
throughout fitting. Only the separately returned display PNG is normalized.
The existing learned indoor model adapter labels raw output `meters`; replacing
that model requires checking its distance convention and scale. A radial-range
model needs an explicit conversion before calling this function.

Without calibration, the draft assumes a **60 degree horizontal field of view**,
square pixels, and a principal point at the image centre. The response exposes
that assumption through `camera.source: "fov-assumption"`, a warning, and low
confidence. This assumption may significantly change dimensions and angles.

## Fitting and bounds

1. Sample at most approximately 8,000 source pixels and reject missing,
   nonfinite, or implausible depth outside 0.15–30 metres. Exclude all detected
   furniture bounding boxes with a small margin; enclosing boxes conservatively
   exclude the furniture masks and their holes as well.
2. Use a seeded, 180-trial RANSAC fit on the lower 48% of the image to find a
   plausible floor plane. The floor normal must be within about 48 degrees of
   camera-down and the camera must be 0.25–3.5 metres above it. Require
   substantial horizontal, vertical, and lower-image support. Refine the
   inlier plane with SVD and reject constant or degenerate depth.
3. Collect floor inliers across the image, excluding grazing rays that make
   extent estimates unstable. Fit up to three vertical wall planes using
   another bounded, seeded RANSAC. Walls must have sufficient horizontal and
   vertical metric support and must exclude floor/furniture samples.
4. Align floor axes to the strongest wall's Manhattan directions, or to the
   camera when no wall is supported. Begin with robust 1st–99th percentile
   floor extents. A supported wall can replace a nearby extent only when it
   agrees with a Manhattan direction and almost all floor samples lie inside
   it. Small wall-normal errors are snapped at the observed wall centre,
   instead of extrapolating that error toward the camera.
5. Translate the resulting rectangle to positive draft XZ metres and derive
   the exact plane homography from camera calibration and the fitted basis.
   Reject implausible or degenerate extents and singular mappings.

These are explicit priors for an upright photograph of a mostly planar floor
and approximately rectangular room. Sloped floors, severe camera roll, unusual
room shapes, mirrors, weak depth, and large occlusions may require manual
correction or yield no proposal. Learned metric depth remains an estimate even
when the fitted planes are internally consistent. Confidence is medium only
with provided calibration, strong floor support, and a supported wall; it is
never high.

## Proposal contract

Successful drafts contain:

- `status: "estimated"`, `source: "model-estimated"`, `partial: true`, method,
  low/medium confidence, and review warnings.
- `floorPolygonXZ: [[0,0], [W,0], [W,D], [0,D]]`, `widthM`, and `depthM` in
  metres. These are the observed visible extent's approximate rectangular
  bounds, **not guaranteed wall-to-wall room measurements**. The bounding
  rectangle can include cropped or occluded areas between supported samples.
- Four `boundaryEdges`, in the polygon's edge order: near, right, far, left.
  `observed-wall` means a supported vertical plane bounds that edge;
  `view-limit` means a crop/visibility/support limit. A view limit must not be
  presented as a discovered wall. Unseen/opposite walls remain unknown, so all
  single-image drafts remain partial even when several walls are observed.
- A row-major nine-number `imageToFloor` homography. Apply it to `[u,v,1]` and
  divide the first two components by the third to obtain draft `[X,Z]` metres.
  It is meaningful on the fitted floor and can extrapolate outside the draft
  for pixels belonging to walls, furniture, or unobserved areas.
- `floorCornersPx` only when all four projected rectangle corners lie within
  the source image and near actual floor-depth support. Otherwise it is an
  empty array. No constant trapezoid or image-border polygon is substituted.
- The camera and optional `fitting` diagnostics: floor plane, camera height,
  inlier counts/residuals, supported wall planes, and the floor basis in camera
  coordinates. Diagnostics do not constitute surveyed accuracy.

Ceiling/room height is omitted because a vertical wall's visible height does
not establish a ceiling. Openings are omitted because this fitter does not
classify rectangular wall features reliably. A picture frame or furniture box
must not become an invented window or door. Future opening candidates require
actual wall-feature evidence, metric placement, and explicit human review.

If raw metric depth is missing, heuristic, flat, misaligned, or unsupported,
the result is `status: "insufficient-evidence"`, `source: "unavailable"`, with
no dimensions, metric polygon, or homography. OpenCV Hough segments from the
actual photo may appear in `fitting.lineCandidatesPx` and set the method to
`image-lines-only`; those segments do not establish a floor or room scale.
Blank images yield no line candidates. The legacy `/analyze.room_estimate`
retains classical line diagnostics but no fabricated fallback boundary polygon.

## Verification

Run the bounded synthetic tests without downloading or loading any weights:

```bash
PYTHONPATH=services/vision .artifacts/vision-venv/bin/python -m unittest discover \
  -s services/vision/tests -p test_room_reconstruction.py -v
```

The tests render independent analytic pinhole intersections with a floor and
walls, then check metric dimensions, camera height, homography mapping, focal
and depth scaling, seeded repeatability, noise/outliers/furniture exclusion,
field-of-view warnings, and rejection of unsupported/invalid inputs. They also
check that real line segments cannot create metric dimensions or placeholder
corners. These synthetic checks establish geometry behavior, not accuracy of
learned depth on an arbitrary real photograph; measured room references remain
necessary for such an evaluation.

The `/analyze` route-function contracts are covered in
`services/vision/tests/test_reconstruction_route.py`: room-only requests still
fit raw depth without exporting a display PNG, heuristic/failed depth yields
no geometry, and invalid intrinsics are rejected. These tests mock inference
and call validated route functions directly; they do not start a server.

Shared TypeScript tests cover dimension precedence, explicit opening review,
scale references, stale revisions, invalid proposals, source pixel resizing,
portable persistence and keeping furniture/alternative layouts intact. Run
`pnpm test`; `tests/run.mjs` imports actual cases in-process to avoid Node 25
reporting only file-level passes with the module hook.

`pnpm verify:reconstruction` checks Python -> TypeScript integration. It uses
analytic depth with a deliberate 0.8 scale bias and an independent floor length
to recover the visible extent at the expected scale, while preserving the
unknown ceiling height. In an environment that blocks Node child processes:

```bash
.artifacts/vision-venv/bin/python scripts/reconstruction-fixture.py > /tmp/auraspace-room-fixture.json
node --import ./tests/register.mjs scripts/verify-room-reconstruction.mjs --fixture /tmp/auraspace-room-fixture.json
```

This is a reproducible geometry/integration check, not a real-room accuracy
benchmark. Automatic height and opening recovery and multi-view fusion remain
separate work; the review UI accepts only deliberately selected opening
candidates if a future backend supplies them.

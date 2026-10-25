# Evaluation status

No verified public-dataset detection, mask, depth, dimension, or inpainting-quality benchmark is included. The former report contained numbers hardcoded by its generator; it has been replaced with an explicit `not_evaluated` report.

## Automated evidence

- JavaScript: SAT fixtures, room containment, conservative doorway clearance, rotation/snapping, serialization, store history, item identity/locking, extraction idempotency, coordinate contracts, pixel processing, and SVG escaping.
- Python: grayscale/CLAHE/edges, mask dimensions and expansion, outside-mask preservation, image decoding, request validation, classical processing/inpainting HTTP contracts, and evaluation bookkeeping. Detection is mocked in API contract tests.
- Browser: desktop/phone viewport checks, drag without automatic panels, undo/redo, explicit inspection, tray placement, saved layouts, SVG download, sample extraction, creation/reopen, missing-project handling, and API error behavior.

The browser checks use desktop Chromium with phone viewport sizes. They do not replace testing touch/camera access on physical Android/iOS hardware. No native build exists.

## Real benchmark workflow

Filter supplied official COCO annotations with `services/vision/scripts/prepare_datasets.py`. It preserves actual image IDs, furniture annotations, and source license records. Obtain the corresponding images separately and retain their provenance.

Run a pinned detector and save COCO-format predictions (`image_id`, `category_id`, `bbox: [x,y,width,height]`, `score`). Pass annotations and predictions to `services/vision/scripts/evaluate.py`. It computes greedy, one-to-one category-aware precision/recall at IoU 0.5 for non-crowd furniture boxes. It does not implement COCO AP, ignored-region evaluation, or segmentation evaluation.

Still required by PLAN.md: official box/mask mAP evaluation; independent measured-room dimension errors; depth-convention checks; paired synthetic removal evaluation; real-photo correction effort; checkpoint/data hashes and splits; cold/warm latency and memory; named-device graphics performance; and end-to-end native lifecycle testing.

## Native implementation evidence (25 October 2026)

The model manifest pins Mask R-CNN COCO_V1 and the IOPaint Big-LaMa TorchScript artifact by SHA-256, and Depth Anything V2 Metric Indoor Small by upstream revision plus all local-file checksums. `reports/model-smoke.json` records a public COCO sofa detection/removal run with exact outside-mask preservation. `reports/depth-smoke.json` records a real metric-depth invocation with finite meter output. These are execution smoke tests, not independent accuracy benchmarks.

Nineteen synthetic Python tests cover processing, reviewed paint/erase masks, invalid selections, HTTP responses, source-coordinate semantics, and millimeter PNG roundtrips. Scene tests cover physical identity, shared dimensions, fixed fixtures, constraints, calibration and portable-copy references. Real platform tests cover private ownership, revisions, hashes, queue persistence and proposal-only late results. The Android emulator exercises the compiled APK rather than a responsive browser viewport.

Still collect independently annotated masks/detections, paired removal samples, measured real rooms, cold/warm runtime/memory, physical-device frame times, and user correction effort. Keep frozen splits and separate entered measurements from model estimates. `evaluation_report.json` deliberately leaves unsupported metrics as `not_evaluated`.

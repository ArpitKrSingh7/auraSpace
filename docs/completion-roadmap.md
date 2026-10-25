# Completion roadmap

This sequence closes remaining Android first-release and pilot gaps before the later device/R&D extensions in PLAN.md. Existing passing tests describe a preview, not full completion of every acceptance gate.

| Order | Work | Acceptance evidence |
| --- | --- | --- |
| 1 | Complete cloud project download and restore. Add paginated project browsing, metadata/scene retrieval, referenced-asset downloads with checksums, local-only versus downloaded state, and explicit conflict choices. Preserve both versions before replacement. Scope links/jobs/media to their server/account. | Two independent clients can upload, download, edit, encounter a conflict, preserve both drafts and reopen after restart. Interrupted downloads resume without leaving an apparently complete project. |
| 2 | Finish recovery tests. Exercise network loss during upload/job creation, API/Redis outages, worker termination after output upload, cancellation races, app background/process loss, low storage, ZIP export/import and deletion cleanup. | Fault-injection checks show durable status, no duplicate physical items, no lost measured values, no stale proposal overwrites and actionable retry/manual recovery. |
| 3 | Validate real Android interaction and performance. Test camera permission denial, real gallery/EXIF variants, inside/plan gestures, large text, long-press/tap alternatives, screenshots and native sharing on a representative older phone and a current phone. | Record exact model/Android/build, 20-item frame times, 50-item stress memory/thermals and lifecycle results. Fix failures before calling the phone gate complete. |
| 4 | Replace placeholder room proposals with evaluated geometry proposals. Add camera-intrinsics-aware depth unprojection, robust structural plane/line fitting, calibrated scale anchors, floor/wall polygon and opening proposals, source/proposal provenance and confidence-based abstention. Retain numeric/manual correction. | Compare supported real photos against independent room measurements; report boundary/dimension error, failures and correction effort. Never infer physical dimensions from normalized depth colors or mark category priors as measured. |
| 5 | Establish model and usability evidence. Freeze annotated train/validation/test splits; evaluate detector/masks, preprocessing ablations, depth error and paired/synthetic removal with outside-mask preservation. Run the requested room-capture/placement user study. | Reproducible real metrics, exact manifests, representative failure examples and recorded user correction effort. User-entered measurements are reported separately from learned accuracy. |
| 6 | Configure and validate accounts/deployment. Use an actual OIDC provider, test account linking/refresh/revocation and cross-user access. Add hosted HTTPS, secret management, storage/DB backup-and-restore, retention, bounded operational metrics and alerts. | Multi-user account flow and disaster-recovery evidence in staging; no unauthorized project/artifact access. Prepare production signing only when release credentials are available. |
| 7 | Implement the later Android device extension where supported: ARCore capture adapter, calibration/coordinate mapping and measured scene conversion. Then evaluate multi-view fusion, AR placement, improved mesh/texture representations and arrangement search separately. | Unsupported hardware retains ordinary-photo/manual mode. Each extension has its own measured correctness, quality and performance gate. |
| 8 | Final deliverables: verified APK/AAB, reproducible startup, fixtures/model/dataset manifests, evaluation report, architecture/capture/operations notes, report/slides and demonstration video. | PLAN.md checklist items link to actual device runs, artifacts and measurements. |

## Inputs that require the project team

- Access to physical Android phones, including at least one representative older model.
- Real room photographs and independently measured room/furniture dimensions, with permission for evaluation.
- An OIDC provider configuration and hosting/signing credentials when deploying the pilot.
- Participants for the requested usability study and a recorded final demonstration.

Code and emulator work can continue without these inputs. Physical measurements, live provider verification and real-user study results must remain pending until actually performed.

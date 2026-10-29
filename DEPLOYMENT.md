# Deploying AuraSpace

The repository contains several applications. The current `vercel.json` deploys
the **Next.js web companion and the FastAPI vision service** using Vercel
Services. It does not deploy the native Expo app, TypeScript API, BullMQ worker,
PostgreSQL or Redis. Web rooms currently live in browser-local storage.

## Current Vercel build failure

The reported Next.js build completed successfully. Python installation failed
because the requirements file made the PyTorch CPU repository a global extra
index. uv's default first-index behavior found `requests==2.28.1` there and did
not continue to PyPI for the required `requests>=2.31.0`.

`services/vision/pyproject.toml` is now the Vercel Python dependency manifest.
It selects Python 3.12, includes the depth dependencies, and explicitly assigns
only Torch/Torchvision to the CPU index. Other packages resolve from PyPI. The
existing pip requirements remain available for the local/Docker setup.

This follows [uv's explicit index configuration](https://docs.astral.sh/uv/concepts/indexes/)
and [Vercel's Python dependency configuration](https://vercel.com/docs/functions/runtimes/python#dependencies).
It does not require downgrading requests or globally changing index strategy.

## Deploy the current web and vision services

1. Push `services/vision/pyproject.toml` and `services/vision/.python-version`,
   together with the existing committed source. In Vercel, use the repository
   root (`.`) as Root Directory. Keep the service definitions in `vercel.json`;
   the `app` service is Next.js at root and `vision` is FastAPI under
   `services/vision`.
2. Redeploy the new commit. The Python installer should now report
   `Installing required dependencies from pyproject.toml...`. If the log still
   references only `requirements.txt`, check the deployed commit and service
   root; retry without the old build cache when necessary.
3. The existing service binding injects `VISION_SERVICE_URL` into the Next.js
   service. Do not replace it with `http://localhost:8000` or a laptop address.
   In Services mode, build commands belong to each service rather than the
   top-level configuration. The Next.js build already passed in the supplied
   log, so it does not need a new build command to address this failure.
4. Open the deployed web app and `/api/health`. A healthy UI and reachable
   vision service verify routing, not model readiness. Check an actual photo
   job separately after configuring the checkpoints below.

Vercel supports this frontend/backend arrangement through
[Services and private bindings](https://vercel.com/docs/services). Python
support is not the reason for the reported dependency error.

## Model files are a separate deployment input

Git ignores `.artifacts/models`; a GitHub deployment does not contain the local
checkpoints. Python dependencies and model weights are different things.

For the full learned pipeline, the vision runtime needs the pinned files in
`services/vision/model-manifest.json` and server-side paths/settings:

| Setting | Required asset |
| --- | --- |
| `MASKRCNN_MODEL_PATH`, `MASKRCNN_MODEL_SHA256` | Verified Mask R-CNN checkpoint |
| `LAMA_MODEL_PATH`, `LAMA_MODEL_SHA256` | Verified Big-LaMa checkpoint |
| `METRIC_DEPTH_MODEL_PATH` | Directory containing the pinned indoor depth model files |

`services/vision/scripts/download_models.py --include-depth --output <directory>`
downloads and checksum-verifies those assets. A hosted build must deliberately
package them, or a container deployment must provision them at the runtime
paths. Local `.env` paths are not automatically valid on Vercel. Do not commit
the model binaries or private `.env` file to solve this.

Without configured metric depth, the service returns a heuristic visualization
and reconstruction correctly reports insufficient evidence. Without the
configured LaMa asset, removal can use the approximate OpenCV fallback. The
detector may attempt a Torchvision download when no local checkpoint is set;
that is not a verified hosted model provisioning strategy.

Vercel's standard Python function bundle limit is 500 MB uncompressed, with
[large functions up to 5 GB available in beta](https://vercel.com/docs/functions/limitations#large-functions-beta).
The full ML environment can exceed the standard limit. Memory, concurrency
and cold inference also need measurement. If a subsequent build reports a
bundle-size failure, configure the supported large-function path or deploy
vision as a container service; the requests-resolution fix alone does not
prove that all models fit a particular plan.

The web proxy currently allows 50 seconds for its upstream call and the browser
allows 55 seconds. A longer hosting execution limit does not extend these
application timeouts. Slow/cold inference may need model warmup and, ultimately,
an asynchronous web job flow. Native jobs already use the queue.

## Deploying the native backend platform

For native photo jobs and cloud storage, provision these separately from the
current two-service web deployment:

| Component | Deployment requirement |
| --- | --- |
| TypeScript API | Node service from `apps/api/src/index.ts`; hosted PostgreSQL, Redis and storage configuration |
| BullMQ worker | Persistent queue consumer from `apps/worker/src/index.ts`; same database/Redis/storage and reachable vision URL |
| Vision | Python inference service with provisioned weights and measured memory requirements |
| PostgreSQL | Persistent database; run the checked-in Prisma migrations |
| Redis | Persistent queue; BullMQ needs a TCP/TLS `redis://` or `rediss://` URL |
| Supabase Storage | Private image/artifact bucket and server-only service-role credentials |
| Expo app | Separate mobile build, configured with the hosted API URL; APK rebuild remains deferred |

The existing `infra/backend.Dockerfile` and `docker-compose.yml` describe the
API/worker/database/queue arrangement; `services/vision/Dockerfile` describes
the Python service. Compose's model mount is a local path: provision those
files explicitly when moving to a server. Supabase Storage alone supplies
neither PostgreSQL nor the Redis queue used by the current local setup.

A practical deployment can keep web on Vercel and run API/worker/vision on a
container host, with persistent database/queue services. Alternatively, Vercel
Services and its current worker offerings need their own configuration and
resource validation; the current `vercel.json` has no API or worker definition.
For an externally hosted vision service, deploy the web service without the
internal `vision` binding and set `VISION_SERVICE_URL` to that service's HTTPS
base URL. Keep its `/analyze`, `/process`, `/inpaint`, and `/health` paths intact.

## Verification status for the dependency fix

The TOML parses, the runtime/dependency declarations were checked, and the CPU
index is restricted to Torch/Torchvision. A full `uv lock --python 3.12` could
not run in the current restricted shell because uv's interpreter download
failed DNS resolution. No lockfile or successful cloud deployment is claimed.
No servers, models or APK build were started for this fix. The next Vercel
build is the remaining check of dependency resolution and packaging.

# Deploying AuraSpace

AuraSpace has two runtime services: the Next.js website and the Python vision
service. Room projects are saved in the browser and can be exported as JSON.
The website does not need an account API, database, job queue, Redis or Docker.

## Deploy web and vision on Vercel

The root `vercel.json` configures the Next.js app and a private FastAPI vision
service. Keep the repository root as the Vercel project root. The app receives
the vision service URL through the private service binding; do not replace it
with a localhost URL.

The vision build downloads the pinned detector, depth and removal models using
`services/vision/model-manifest.json`, then verifies their hashes. Model weights
are build assets and must remain out of Git. The Python bundle is large, so
check the current Vercel Python function size and compute limits for the chosen
plan before deploying. The project previously needed Vercel's Large Functions
build setting; see the [Vercel function limits](https://vercel.com/docs/functions/limitations)
and [Services](https://vercel.com/docs/services) documentation for current
requirements.

After deployment, check `/api/health`, then test a real room photo through
detection, room review and removal. A healthy service response alone does not
confirm that all model weights loaded or inference completed. Real-room
accuracy, peak memory and large-image behavior still need evaluation.

## Use a separately hosted vision service

If the Python service is hosted separately, use `infra/vercel.web-only.json` as
the web project's Vercel configuration and set the server-only
`VISION_SERVICE_URL` to the hosted service URL. Configure `VISION_API_TOKEN`
server-side when the vision host requires it. Never expose this token through a
`NEXT_PUBLIC_*` variable. Keep the web proxy pointed at the hosted service, not
at a developer machine.

## Local development

Follow [RUNNING.md](RUNNING.md). Manual room planning needs only Next.js; photo
analysis also needs the local Python vision service. No container or separate
database/queue setup is needed.

## Current project scope

Project data stays in the user's browser. JSON export/import is the portable
backup path; deploying the website does not add accounts or cloud sync. Cloud
accounts and background processing are outside this college project's current
scope.

On 30 October 2026, the deployed website returned its metadata and manifest,
processed a synthetic image, executed Mask R-CNN and the pinned indoor metric
depth model, and returned a Big-LaMa removal result. A synthetic non-room image
correctly produced an insufficient-evidence room proposal. These checks show
model execution, not real-room accuracy or production-scale performance.

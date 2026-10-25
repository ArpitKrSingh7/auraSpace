# Running AuraSpace on a laptop or Android phone

Run commands from the repository root. **There is one configuration file: `.env`.** It is private, ignored by Git and excluded from Docker images. The earlier environment files have been consolidated into it. Do not create additional environment files for the web, API, worker or Android app.

The default setup uses **Supabase Storage**, with PostgreSQL and Redis running locally in Docker. Supabase Storage does not replace the database or Redis queue. Manual room editing works offline; photo analysis and cloud sync need the backend.

## 1. Configure the root `.env`

On this machine the file already exists. Keep its database/Redis settings and set the three `SUPABASE_*` values. For a fresh checkout, create `.env` with this template:

```dotenv
# Local database and queue. Keep each password consistent with its URL.
POSTGRES_PASSWORD=local-auraspace-database-only
REDIS_PASSWORD=local-auraspace-queue-only
DATABASE_URL=postgresql://auraspace:local-auraspace-database-only@127.0.0.1:5438/auraspace
REDIS_URL=redis://:local-auraspace-queue-only@127.0.0.1:6388

# Supabase Storage API: no separate S3 keys or region required.
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=AuraSpace

# Local services; PORT is the API port. The web app uses port 3000.
VISION_SERVICE_URL=http://127.0.0.1:8000
PORT=4000
HOST=0.0.0.0
API_BIND_ADDRESS=0.0.0.0
CORS_ORIGINS=http://localhost:3000
ALLOW_GUEST_SESSIONS=true
WORKER_CONCURRENCY=1

# Optional public settings for Android source builds.
# The installed app also has Settings > Server URL.
# EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_IP:4000
# EXPO_PUBLIC_OIDC_ISSUER=https://your-provider.example/
# EXPO_PUBLIC_OIDC_CLIENT_ID=your-public-mobile-client-id

# Optional backend account verification; configure together with mobile login.
# OIDC_ISSUER=https://your-provider.example/
# OIDC_AUDIENCE=auraspace
# OIDC_JWKS_URL=https://your-provider.example/.well-known/jwks.json
```

Use your Supabase project URL and server-only service-role key. The bucket name is case-sensitive: `AuraSpace`. The API creates it as a private bucket if it does not exist, and refuses a public bucket. Other buckets are not renamed or modified. No S3 endpoint, region or separate S3 keys are needed. The adapter uses the [Supabase Storage API](https://supabase.com/docs/guides/storage/serving/downloads).

Keep the service-role key, database and Redis credentials on the server. Only explicitly public `EXPO_PUBLIC_*` values belong in Android builds. Next.js reads the root `.env` automatically; API/worker scripts load it explicitly, and Expo's config reads it from the repository root. Restart affected services after editing the file; changes to bundled Android settings require rebuilding the app.

## 2. First-time preparation

Requires Node.js 24+, pnpm 12.8.1, Python 3.11+ and Docker. The shell commands below use Bash; on Windows use WSL2 for the backend and web commands. Native Android builds use the tools in [Android setup](docs/android-setup.md).

```bash
pnpm install
pnpm check:env
pnpm db:generate
docker compose -p auraspace up -d database redis
pnpm db:migrate
python3 -m venv .artifacts/vision-venv
.artifacts/vision-venv/bin/pip install -r services/vision/requirements-depth.txt
python3 services/vision/scripts/download_models.py --include-depth
```

Skip dependency installation and model downloads when already prepared. `pnpm check:env` catches missing values and unreplaced placeholders without printing credentials. It validates configuration format, not a live Supabase connection. Existing PostgreSQL and Redis volumes retain the same names as the previous setup.

## 3. Start on your laptop

Run each command in its own terminal from the repository root:

```bash
# Terminal 1 — photo processing
bash scripts/vision-local.sh
```

```bash
# Terminal 2 — API
pnpm dev:api
```

```bash
# Terminal 3 — background jobs
pnpm dev:worker
```

```bash
# Terminal 4 — web companion
pnpm dev
```

Open **http://localhost:3000**. The web companion stores its rooms in browser-local storage; native cloud restore is still part of the completion roadmap. For manual web editing alone, only `pnpm dev` is needed. Keep using services already running instead of starting another process on the same port.

## 4. Use your Android phone

1. Transfer `artifacts/auraspace-android-preview.apk` to your phone and install it. This APK is a local build artifact, not included in a fresh clone; [Android setup](docs/android-setup.md) explains how to build it.
2. Open AuraSpace. The standalone APK includes its JavaScript and needs no Metro server.
3. Keep your phone and laptop on the same reachable Wi-Fi and run the backend above. Find your laptop's Wi-Fi IPv4 address in its network settings.
4. In AuraSpace, open **Settings → Server URL**, enter `http://<laptop-Wi-Fi-IP>:4000`, then use **Test connection**.
5. Create a room, add furniture, and import a photo to test upload and processing.

For the standard Android emulator use `http://10.0.2.2:4000`. `localhost` on a phone refers to the phone itself. If the connection fails, check the laptop firewall and whether the Wi-Fi isolates devices. USB debugging can alternatively forward the API with `adb reverse tcp:4000 tcp:4000`; then use `http://127.0.0.1:4000` in the app while USB remains connected.

The preview permits local HTTP. Production builds require HTTPS. Manual editing remains available without the backend; Supabase alone does not host the API, worker or Python models.

## Alternative: run all services in Docker

Use this instead of the host processes above, to avoid port conflicts. Configure `.env` and download the models first:

```bash
pnpm check:env
docker compose -p auraspace up --build -d
```

There is one active compose file, `docker-compose.yml`. It starts the database, queue, migration, API, worker, vision service and web companion. Media goes directly to Supabase Storage; no SeaweedFS service or Supabase override file is needed. Compose reads the root `.env` and translates database/Redis/vision addresses to internal service names. API/worker Supabase settings stay those from `.env`.

`API_BIND_ADDRESS=0.0.0.0` makes the API reachable from a phone on your LAN. Use `127.0.0.1` if you only want laptop access. The web companion is available on the laptop at port 3000.

## Health checks and stopping

For the host-process setup:

```bash
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:3000/api/health
```

The all-Docker setup keeps vision internal; use the API/web health endpoints and `docker compose -p auraspace logs vision` instead. API health checks PostgreSQL/Redis, API startup checks the storage bucket, and a photo upload plus result download verifies storage writes/reads. Run `pnpm verify:storage` to check private upload/download integrity, temporary signed access and deletion against your configured bucket. It creates a uniquely named test image and deletes it afterward.

Stop host processes with Ctrl+C in their terminals. Stop containers with `docker compose -p auraspace stop`; this preserves the database and queue volumes. Earlier running processes keep their original configuration until restarted.

## Hosted database, Redis and accounts

Supabase Storage, Supabase Database and account login are separate choices. To use hosted PostgreSQL or Redis with the host processes, edit `DATABASE_URL`/`REDIS_URL` in the same `.env` and run the database migrations. BullMQ needs a Redis TCP/TLS URL (`redis://` or `rediss://`), not an HTTPS REST endpoint. The all-Docker configuration explicitly uses local database/Redis containers; hosted equivalents require changing those two compose environment overrides as well.

Changing local passwords requires matching URL and container settings; existing PostgreSQL volumes also require updating the database role password. Do not delete volumes to rotate credentials. See [Android setup](docs/android-setup.md) for optional OIDC login configuration.

## Project status and cleanup

[Completion roadmap](docs/completion-roadmap.md) lists unfinished implementation and real-device/evaluation gates. [Implementation audit](docs/implementation-audit.md) records the available evidence. Superseded compose files and unused editor components are preserved in [.deprecated](.deprecated/README.md), excluded from builds. Tests, model files and the verified APK have been retained.

The configured Supabase adapter has been checked with a private-bucket upload/download, signed URL, anonymous-access denial and deletion, plus API ownership/integrity checks. Existing local preview media was copied with checksum verification; local originals were retained. Re-run `pnpm verify:storage` after changing the project, bucket or key.

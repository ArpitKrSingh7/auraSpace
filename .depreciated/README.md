# Deferred mobile application

The project is website-first as of 30 October 2026. The Expo/Android source is
preserved in `mobile/`. The removed documentation remains in Git history.
It is excluded from the active pnpm workspace, web type checking, Docker builds
and Vercel uploads. No APK build or mobile server is part of the current demo.

The active website still includes all furniture assets, 2D/3D planning,
image processing, learned vision, and correctable room reconstruction.
`apps/api`, `apps/worker`, and `packages/backend` remain available for future
website accounts/cloud jobs; they are not required for browser-local planning
or the current direct web-to-vision flow.

To resume mobile work, move `mobile/` back to `apps/mobile/`, restore its root
development command, then run `pnpm install` to restore its workspace/lockfile
entries. Its Metro/Android paths assume that original location. Recheck peer
versions, gestures and backend connectivity before building a new APK.

Generated local caches/builds, where present, are ignored. Existing APK artifacts
and model files are retained outside this source archive.

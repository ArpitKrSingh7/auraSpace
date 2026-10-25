# Android setup and acceptance

## Build

The preview uses Expo SDK 55, React Native 0.83.10, React 19.2, React Three Fiber 9 and Three.js 0.182. Expo's compatible native package versions are recorded in the lockfile. Metro resolves shared React and Three imports to the Android app's versions; the web companion retains its own compatible versions.

Local build tools used: Java 17.0.21, Android compile/target SDK 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, and the generated Gradle 9 wrapper. Minimum SDK is 24; the requested practical test range is mainstream ARM64 phones released from 2020 onward, starting with Android 10. No LiDAR or ARCore is needed for ordinary-photo/manual mode.

```sh
pnpm install
# Only needed when regenerating native configuration:
cd apps/mobile
EXPO_PUBLIC_ALLOW_HTTP=true pnpm exec expo prebuild --platform android --no-install
cd android
# Generate the standard local preview signing key if absent after a fresh checkout:
keytool -genkeypair -keystore app/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US'
EXPO_PUBLIC_ALLOW_HTTP=true ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon --max-workers=4
```

Use [RUNNING.md](../RUNNING.md) for laptop services, phone connection and the single root `.env`. Expo reads optional public build settings from that file; no mobile environment file is needed. Set `JAVA_HOME` and `ANDROID_HOME` to installed tools before building. Do not regenerate an existing debug key merely to rebuild. The APK bundles Hermes JavaScript and opens without Metro. It uses preview signing and is not a Play Store production release. Production signing credentials and HTTPS infrastructure are deployment inputs.

```sh
# Run from the repository root, not apps/mobile/android:
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.auraspace.studio/.MainActivity
```

The generated native project is retained as source; Gradle outputs, local SDK paths and signing keys are ignored.

## Device workflow

1. Open the example or create a measured rectangular room.
2. Switch overview/inside/plan. Place and move furniture; confirm that no tray or inspector opens automatically.
3. Open Details deliberately; change one measured dimension and rotate numerically. Exercise undo/redo.
4. Use photos, allow/deny camera access, and import from the Android picker. Close and reopen the app to check persisted media.
5. Configure the local API address. Analyze a photo, review its result, correct a mask, and keep a piece in the tray.
6. Generate a removal preview. Review the before/after rather than treating generated pixels as geometry evidence.
7. Open optional processing/depth tools. Request an output and accept it explicitly.
8. Export a portable project, import a separate copy, and verify photos, observations, dimensions and layouts.
9. Disconnect the network during upload and background/force-stop the app. Reopen; the queued operation should resume. Cancel a queued request and retry a failed result.
10. Create an alternative, lock a fixture, reopen, and verify that dimensions remain shared while arrangements stay independent.

## Required physical measurements

Record the actual phone model, Android version, memory, build hash, frame time, input latency and failures. The 30 FPS target for a representative 20-item scene is a target until measured on the base phone. Run the 50-item stress case separately and check thermals, memory and repeated background/resume cycles. Emulator rendering and desktop viewport tests do not establish phone performance or camera quality.

## Optional OIDC account configuration

Set `EXPO_PUBLIC_OIDC_ISSUER` and `EXPO_PUBLIC_OIDC_CLIENT_ID` before bundling. Register `auraspace://auth/callback` with a public mobile client using authorization code plus PKCE. The server needs matching `OIDC_ISSUER`, `OIDC_AUDIENCE` and `OIDC_JWKS_URL`. Access/refresh tokens use SecureStore. Linking a verified account transfers its authenticated guest projects; the guest token is revoked afterward. A live identity-provider login is not included in the emulator evidence because no provider credentials were supplied.

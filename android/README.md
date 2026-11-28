# Conductor IO (Android)

The TraceyTech app for Android, package `uk.co.noteai.app` (it replaces the old NoteAI app on Play).

- **Home** and **Voice** show traceytech.app itself, so everything the web app does works here.
- **Lists**: multiple to-do lists. Uses `/api/lists` (worker/lists.js) when the Worker has it, otherwise keeps custom lists on the phone.
- **Voice fob**: a foreground service keeps the NoteAI fob (M5StickS3) connected over Bluetooth LE with the phone locked, receives each recording (same protocol as /voice) and uploads it to `/api/voice/audio`.
- **Background**: WorkManager checks TraceyTech every 15 minutes (adjustable), sets exact alarms for due to-dos and calendar events, and notifies about voice notes that wait for a press, new invites and new non-bulk email.
- Full screen, portrait, edge to edge. Minimum Android 13, targets Android 16 (API 36).

## Build

Needs JDK 17+ and the Android SDK (platform 36).

```
./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
```

Release builds are signed when `android/keystore.properties` exists (never commit it):

```
storeFile=C:/path/to/NoteAi-upload.p12
storePassword=...
keyAlias=noteai-upload
keyPassword=...
```

Bump `versionCode` in `app/build.gradle.kts` for every upload to Play.

# Fix Ur Finance — Android App

This project ships an Android wrapper built with [Capacitor](https://capacitorjs.com/)
that loads the live web app at `https://fixurfinance.lovable.app`. Web and
Android share the **exact same UI** — any change you ship to the web app is
instantly visible inside the Android app on next launch.

You only need to re-submit to Google Play when you change native code,
plugins, icons, permissions, the splash screen, or `capacitor.config.ts`.

---

## What's installed

- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` — the wrapper
- `@capacitor/camera` — native camera for receipt scanning
- `@aparajita/capacitor-biometric-auth` — fingerprint / face unlock
- `@capacitor/splash-screen`, `@capacitor/status-bar` — native chrome

App identity (in `capacitor.config.ts`):
- **App name**: Fix Ur Finance
- **Package ID**: `app.fixurfinance.tracker`

---

## One-time local setup (on your machine — not in Lovable)

Lovable's sandbox does not include the Android SDK, so the actual APK / AAB
build must run on your computer.

### 1. Prerequisites
- [Node.js 20+](https://nodejs.org/) and `bun` (or `npm`)
- [Android Studio](https://developer.android.com/studio) (Hedgehog or newer)
  with the Android 14 (API 34) SDK + Build Tools installed
- JDK 17 (bundled with recent Android Studio)
- A [Google Play Console](https://play.google.com/console) developer account
  ($25 one-time fee) when you're ready to publish

### 2. Pull the project
```bash
git clone <your repo url>
cd <project>
bun install
```

### 3. Add the Android platform (first time only)
```bash
bun run build           # produces dist/
bunx cap add android    # creates the android/ native project
bunx cap sync android   # copies web assets + plugins into android/
```

This generates an `android/` folder. Commit it to your repo so future
builds reuse the same signing config, icons, and manifest tweaks.

### 4. Open in Android Studio
```bash
bunx cap open android
```

Android Studio will index the project. From there:
- Click ▶ to run on an emulator or connected device
- **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)** to
  produce the artifact you upload to Google Play

---

## Updating the app

### Web-only change (UI, copy, business logic)
Just publish from Lovable. The Android app loads the live URL, so it picks
up the change immediately on next launch. **No Play Store action needed.**

### Native change (icon, splash, plugin, permission, package ID)
```bash
bun run build
bunx cap sync android
bunx cap open android
# Build → Generate Signed Bundle → upload new .aab to Play Console
```

---

## Native features wired in

### Camera (receipt scanning)
```ts
import { captureReceipt } from "@/lib/native";

const result = await captureReceipt();
if (result) {
  // result.blob → upload to Supabase Storage
  // result.filename → original/generated name
}
```
On Android this opens the native camera picker (Camera or Gallery). On web
it falls back to a standard `<input type="file">`.

### Biometric unlock
```ts
import { biometricUnlock } from "@/lib/native";

const ok = await biometricUnlock("Unlock Fix Ur Finance");
if (!ok) { /* show password fallback */ }
```
On Android this prompts fingerprint/face. On web it's a no-op (returns
`true`) so the same code path works everywhere.

> To gate the whole app behind biometrics on Android, call `biometricUnlock`
> from your `_authenticated` layout on first mount and render a lock screen
> until it resolves.

---

## Required Android permissions

These are added automatically by the plugins on `cap sync`, but verify they
appear in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

---

## App icon & splash screen

Drop a 1024×1024 PNG at `resources/icon.png` and a 2732×2732 PNG at
`resources/splash.png`, then generate Android assets:

```bash
bun add -D @capacitor/assets
bunx capacitor-assets generate --android
```

---

## Publishing to Google Play (first release)

1. In Play Console → **Create app** → fill name, default language, free/paid
2. **App content** → complete the privacy policy, data safety, content
   rating, and target audience questionnaires (camera + biometric data)
3. **Production → Create new release**
4. Upload your signed `.aab`
5. Fill release notes → **Review release** → **Start rollout to production**

First review typically takes 2–7 days. Subsequent updates usually clear
within a day.

---

## Troubleshooting

- **App shows a white screen** — check `server.url` in `capacitor.config.ts`
  points to a reachable HTTPS URL and the device has internet.
- **Google sign-in popup closes immediately on Android** — Capacitor
  WebViews handle OAuth via the system browser. If you hit this, install
  `@capacitor/browser` and the OAuth flow will open in a Custom Tab.
- **Camera prompt never appears** — ensure `CAMERA` permission is in the
  manifest and re-install the app (Android caches permission denials).

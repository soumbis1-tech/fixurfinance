/**
 * Native bridge helpers. Safe to call from web — they no-op (or fall back)
 * when not running inside the Capacitor Android shell.
 *
 * Import only from client code (components / event handlers), never from
 * server functions or route loaders.
 */
import { Capacitor } from "@capacitor/core";

export const isNativeApp = (): boolean =>
  typeof window !== "undefined" && Capacitor.isNativePlatform();

export const nativePlatform = (): "android" | "ios" | "web" => {
  if (typeof window === "undefined") return "web";
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : "web";
};

/**
 * Capture a receipt photo using the native camera (Android) or the
 * standard file picker (web). Returns a Blob ready to upload to
 * Supabase Storage, or null if the user cancels.
 */
export async function captureReceipt(): Promise<{ blob: Blob; filename: string } | null> {
  if (isNativeApp()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt, // lets user pick Camera or Gallery
        saveToGallery: false,
      });
      if (!photo.webPath) return null;
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const ext = photo.format || "jpg";
      return { blob, filename: `receipt-${Date.now()}.${ext}` };
    } catch {
      return null;
    }
  }

  // Web fallback: open a hidden file input.
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ blob: file, filename: file.name });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Prompt for biometric unlock (fingerprint / face). Returns true if the
 * user authenticated, false on cancel/failure, and true on web (no-op
 * — biometric gating is only enforced inside the native app).
 */
export async function biometricUnlock(reason = "Unlock Fix Ur Finance"): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const check = await BiometricAuth.checkBiometry();
    if (!check.isAvailable) return true; // no hardware → don't lock the user out
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      androidTitle: "Fix Ur Finance",
      androidSubtitle: "Confirm it's you",
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}

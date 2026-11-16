import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { Network } from "@capacitor/network";
import { App } from "@capacitor/app";
import { Device } from "@capacitor/device";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform();

export async function initializeNativeExperience() {
  if (!isNative()) return { native: false, platform: "web" };
  try { await StatusBar.setStyle({ style: Style.Dark }); await StatusBar.setBackgroundColor({ color: "#101114" }); } catch {}
  try { await Keyboard.setResizeMode({ mode: "native" }); } catch {}
  try { await App.setAppUrlOpenListener(({ url }) => { if (url && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("jcb:deep-link", { detail: { url } })); }); } catch {}
  const [network, device] = await Promise.allSettled([Network.getStatus(), Device.getInfo()]);
  return { native: true, platform: platform(), network: network.status === "fulfilled" ? network.value : null, device: device.status === "fulfilled" ? device.value : null };
}

export async function tapFeedback(style = "light") {
  if (!isNative()) return;
  try { await Haptics.impact({ style: style === "heavy" ? ImpactStyle.Heavy : style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light }); } catch {}
}
export async function successFeedback() {
  if (!isNative()) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch {}
}
export async function getNetworkStatus() {
  try { return await Network.getStatus(); } catch { return { connected: typeof navigator !== "undefined" ? navigator.onLine : true, connectionType: "unknown" }; }
}
export async function saveLocalPreference(key, value) {
  try { if (isNative()) await Preferences.set({ key, value: JSON.stringify(value) }); else localStorage.setItem("jcb:" + key, JSON.stringify(value)); } catch {}
}
export async function readLocalPreference(key, fallback = null) {
  try { const raw = isNative() ? (await Preferences.get({ key })).value : localStorage.getItem("jcb:" + key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
}
export async function shareContent(title, text, url) {
  try { if (isNative()) await Share.share({ title, text, url, dialogTitle: title }); else if (navigator.share) await navigator.share({ title, text, url }); else if (url) await navigator.clipboard.writeText(url); } catch {}
}

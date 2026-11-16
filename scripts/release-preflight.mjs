import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] || "--web";
const root = process.cwd();
const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const pass = (message) => console.log("PASS:", message);
const exists = (file) => fs.existsSync(path.join(root, file));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const configPath = path.join(root, "capacitor.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (config.appId !== "com.techstudio.jcbrental") fail("Unexpected native application ID.");
else pass("Native application ID is stable.");

if (config.appName !== "JCB Rental") fail("Native application name is missing.");
else pass("Native application name is configured.");

if (!exists("out/index.html")) fail("Static export is missing out/index.html; run npm run build first.");
else pass("Static web entry point exists.");

const manifestPath = path.join(root, "out/manifest.json");
if (!fs.existsSync(manifestPath)) {
  fail("Exported PWA manifest is missing.");
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons) || manifest.icons.length < 2) {
    fail("PWA manifest must include name, start_url and at least two icons.");
  } else if (manifest.icons.some((icon) => !icon.src || !fs.existsSync(path.join(root, "out", icon.src.replace(/^\//, ""))))) {
    fail("One or more PWA icon files are missing from the export.");
  } else pass("PWA manifest and icon assets are present.");
}

const staticFiles = walk(path.join(root, "out/_next/static")).filter((file) => file.endsWith(".js"));
const secretPatterns = [/sb_secret_[A-Za-z0-9_-]+/i, /SUPABASE_SERVICE_ROLE_KEY/i, /service_role_key/i];
let secretLeak = false;
for (const file of staticFiles) {
  const contents = fs.readFileSync(file, "utf8");
  if (secretPatterns.some((pattern) => pattern.test(contents))) {
    console.error("Potential server credential reference in client bundle:", path.relative(root, file));
    secretLeak = true;
  }
}
if (secretLeak) fail("Potential privileged Supabase credential reference found in client JavaScript.");
else pass("No known Supabase secret/service-role key patterns found in client JavaScript.");

if (mode === "--android") {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== "false") fail("Android release candidate must be built with demo login disabled.");
  if (!exists("android/app/build/outputs/apk/debug/app-debug.apk")) fail("Android debug APK was not generated.");
  if (!exists("android/app/build/outputs/bundle/release/app-release.aab")) fail("Android release AAB was not generated.");
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "false" && exists("android/app/build/outputs/bundle/release/app-release.aab")) pass("Android unsigned release AAB exists with demo login disabled.");
} else if (mode === "--ios") {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== "false") fail("iOS release candidate must be built with demo login disabled.");
  if (!exists("build/JCBRental.xcarchive/Info.plist")) fail("iOS archive is missing or incomplete.");
  else pass("iOS unsigned archive exists with demo login disabled.");
} else if (mode !== "--web") {
  fail("Unknown mode. Use --web, --android or --ios.");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Release preflight passed for", mode);

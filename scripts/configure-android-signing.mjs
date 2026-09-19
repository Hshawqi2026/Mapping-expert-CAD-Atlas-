import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const androidApp = join(root, "android", "app");
const gradlePath = join(androidApp, "build.gradle");
const keystorePath = join(androidApp, "release.keystore");
const required = [
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

mkdirSync(androidApp, { recursive: true });
writeFileSync(
  keystorePath,
  Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, "base64"),
);
let gradle = readFileSync(gradlePath, "utf8");
const signingBlock = `\n        release {\n            storeFile file('release.keystore')\n            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')\n            keyAlias System.getenv('ANDROID_KEY_ALIAS')\n            keyPassword System.getenv('ANDROID_KEY_PASSWORD')\n        }\n`;
if (!gradle.includes("storeFile file('release.keystore')")) {
  gradle = gradle.replace(
    /signingConfigs\s*\{/,
    (match) => `${match}${signingBlock}`,
  );
}
gradle = gradle.replace(
  "signingConfig signingConfigs.debug\n            def enableShrinkResources",
  "signingConfig signingConfigs.release\n            def enableShrinkResources",
);
writeFileSync(gradlePath, gradle);
console.log("Configured Android release signing from GitHub Actions secrets.");

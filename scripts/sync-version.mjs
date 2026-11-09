// The manifest's version (X.Y.Z.0) follows the package's (X.Y.Z). Run by
// `npm version`, which then commits both and tags vX.Y.Z; pushing the tag
// releases it (.github/workflows/release.yml).
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const path = "com.hasteclip.streamdeck.sdPlugin/manifest.json";
const manifest = readFileSync(path, "utf8");
// The plugin's own version: the top level's, one tab in (not Node.js's).
const synced = manifest.replace(/^\t"Version": "[^"]*"/m, `\t"Version": "${version}.0"`);
if (synced === manifest && !manifest.includes(`"Version": "${version}.0"`)) {
	console.error(`Couldn't find the manifest's version in ${path}`);
	process.exit(1);
}
writeFileSync(path, synced);
console.log(`The manifest is ${version}.0`);

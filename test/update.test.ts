/**
 * Updates: versions, a release's package checked, its files put in place,
 * and when the updater does it.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { zipSync } from "fflate";

import { fetchNewer, install, newer, numbers, PACKAGE, unpack, UUID, Updater } from "../src/update.ts";

const text = (s: string) => new TextEncoder().encode(s);
const FOLDER = `${UUID}.sdPlugin`;

/** A release's package: the plugin's folder, zipped, at `version`. */
function pack(version: string, extra: Record<string, Uint8Array> = {}, uuid = UUID): Uint8Array {
	return zipSync({
		[`${FOLDER}/manifest.json`]: text(JSON.stringify({ UUID: uuid, Version: `${version}.0` })),
		[`${FOLDER}/bin/plugin.js`]: text(`// ${version}`),
		[`${FOLDER}/imgs/actions/save-clip/key.svg`]: text("<svg/>"),
		...extra,
	});
}

/** A GitHub that has `version` as its latest release (`digest` overrides its checksum). */
function github(version: string, bytes: Uint8Array, digest?: string | null): typeof fetch {
	const sha = createHash("sha256").update(bytes).digest("hex");
	return (async (url: string | URL | Request) => {
		const href = String(url);
		if (href.endsWith("/releases/latest")) {
			const asset = { name: PACKAGE, browser_download_url: "https://example.test/download", digest: digest === undefined ? `sha256:${sha}` : digest };
			return new Response(JSON.stringify({ tag_name: `v${version}`, assets: [asset] }), { status: 200 });
		}
		if (href === "https://example.test/download") return new Response(bytes, { status: 200 });
		return new Response("", { status: 404 });
	}) as typeof fetch;
}

const temps: string[] = [];
afterEach(async () => {
	for (const t of temps.splice(0)) await fs.rm(t, { recursive: true, force: true });
});

/**
 * A plugin as Stream Deck installs it (in a Plugins folder), at `version`,
 * with the release marker (`marker`: what it says), or without one.
 */
async function installed(version: string, marker: object | false = { repo: "HasteClip/hasteclip-streamdeck", version }, parent = "Plugins"): Promise<string> {
	const top = await fs.mkdtemp(path.join(os.tmpdir(), "hc-sd-"));
	temps.push(top);
	const dir = path.join(top, parent, `${FOLDER}`);
	await fs.mkdir(path.join(dir, "bin"), { recursive: true });
	await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ UUID, Version: `${version}.0` }));
	await fs.writeFile(path.join(dir, "bin", "plugin.js"), `// ${version}`);
	if (marker) await fs.writeFile(path.join(dir, "bin", "updates.json"), JSON.stringify(marker));
	return dir;
}

test("versions compare by their numbers", () => {
	assert.deepEqual(numbers("v1.2.3"), [1, 2, 3]);
	assert.deepEqual(numbers("0.1.0.0"), [0, 1, 0]);
	assert.equal(numbers("1.2"), undefined);
	assert.ok(newer("v0.2.0", "0.1.9"));
	assert.ok(newer("0.10.0", "0.9.0"));
	assert.ok(!newer("0.1.0", "0.1.0.0"));
	assert.ok(!newer("nonsense", "0.1.0"));
});

test("a package's files are checked", () => {
	const files = unpack(pack("0.2.0"), "0.2.0");
	assert.deepEqual([...files.keys()].sort(), ["bin/plugin.js", "imgs/actions/save-clip/key.svg", "manifest.json"]);
	assert.throws(() => unpack(pack("0.2.0", { "elsewhere/evil.js": text("") }), "0.2.0"), /outside the plugin/);
	assert.throws(() => unpack(pack("0.2.0", { [`${FOLDER}/../../evil.js`]: text("") }), "0.2.0"), /odd place/);
	assert.throws(() => unpack(pack("0.2.0", {}, "com.someone.else"), "0.2.0"), /another plugin/);
	assert.throws(() => unpack(pack("0.2.0"), "0.3.0"), /not 0.3.0/);
});

test("a package as Elgato's packer makes it (ZIP64 sizes) is read", () => {
	// Packed by @elgato/cli 1.10.4 (`streamdeck pack --ignore-validation`).
	const files = unpack(new Uint8Array(readFileSync(new URL("fixtures/packed-by-cli.streamDeckPlugin", import.meta.url))), "0.2.0");
	assert.equal(new TextDecoder().decode(files.get("bin/plugin.js")), "// 0.2.0, packed by the Stream Deck CLI\n");
});

test("a newer release is downloaded and checked; the same or older isn't", async () => {
	const bytes = pack("0.2.0");
	const release = await fetchNewer("HasteClip/hasteclip-streamdeck", "0.1.0", github("0.2.0", bytes));
	assert.equal(release?.version, "0.2.0");
	assert.equal(await fetchNewer("HasteClip/hasteclip-streamdeck", "0.2.0", github("0.2.0", bytes)), undefined);
	await assert.rejects(fetchNewer("HasteClip/hasteclip-streamdeck", "0.1.0", github("0.2.0", bytes, `sha256:${"0".repeat(64)}`)), /checksum/);
	await assert.rejects(fetchNewer("HasteClip/hasteclip-streamdeck", "0.1.0", github("0.2.0", bytes, null)), /no checksum/);
	// No release yet.
	const none = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
	assert.equal(await fetchNewer("HasteClip/hasteclip-streamdeck", "0.1.0", none), undefined);
});

test("a release's files go in place, nothing left beside them", async () => {
	const dir = await installed("0.1.0");
	await install({ version: "0.2.0", files: unpack(pack("0.2.0"), "0.2.0") }, dir);
	assert.equal(await fs.readFile(path.join(dir, "bin", "plugin.js"), "utf8"), "// 0.2.0");
	assert.match(await fs.readFile(path.join(dir, "manifest.json"), "utf8"), /0\.2\.0\.0/);
	assert.equal(await fs.readFile(path.join(dir, "imgs", "actions", "save-clip", "key.svg"), "utf8"), "<svg/>");
	const left = await fs.readdir(path.join(dir, "bin"));
	assert.ok(!left.some((f) => f.endsWith(".update")), `left: ${left}`);
	await assert.rejects(install({ version: "0.3.0", files: new Map([["../escape.js", text("")]]) }, dir), /outside the plugin/);
});

test("only a release build installed by Stream Deck updates itself", async () => {
	const log = { info: () => {}, warn: () => {} };
	const release = { repo: "HasteClip/hasteclip-streamdeck", version: "0.1.0" };
	const cases: [object | false, string, boolean][] = [
		[release, "Plugins", true],
		// A local build, or the Marketplace's.
		[false, "Plugins", false],
		// Linked for development.
		[release, "hasteclip-streamdeck", false],
		// A marker that doesn't say its version.
		[{ repo: release.repo }, "Plugins", false],
	];
	for (const [marker, parent, on] of cases) {
		const updater = new Updater({ dir: await installed("0.1.0", marker, parent), log, busy: () => false });
		await updater.start();
		updater.stop();
		assert.equal(updater.on, on, `marker ${JSON.stringify(marker)}, in ${parent}`);
	}
});

test("an update waits while it could lose something, then goes in and restarts the plugin", async () => {
	const dir = await installed("0.1.0");
	let busy = true;
	let restarts = 0;
	const lines: string[] = [];
	const updater = new Updater({
		dir,
		log: { info: (m) => lines.push(m), warn: (m) => lines.push(`warn: ${m}`) },
		busy: () => busy,
		get: github("0.2.0", pack("0.2.0")),
		restart: () => restarts++,
	});
	await updater.start();
	await updater.check();
	assert.equal(await fs.readFile(path.join(dir, "bin", "plugin.js"), "utf8"), "// 0.1.0", "not while busy");
	busy = false;
	updater.nudge();
	for (let i = 0; i < 50 && restarts === 0; i++) await new Promise((r) => setTimeout(r, 10));
	updater.stop();
	assert.equal(restarts, 1);
	assert.equal(await fs.readFile(path.join(dir, "bin", "plugin.js"), "utf8"), "// 0.2.0");
	assert.ok(lines.some((l) => l.includes("Updated to 0.2.0")), lines.join("\n"));
	// Checked again: it's the version now, nothing more to do.
	await updater.check();
	updater.stop();
	assert.equal(restarts, 1);
});

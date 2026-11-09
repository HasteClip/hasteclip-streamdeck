/**
 * Updates for the plugin when it's installed from GitHub's releases (one
 * from the Marketplace is updated by Stream Deck itself).
 *
 * A newer release is downloaded in the background and checked against its
 * SHA-256. It's put in place over this one only when nothing could be lost:
 * HasteClip isn't recording or live, and no key or dial has been used for a
 * couple of minutes. Then Stream Deck is asked to start the plugin again,
 * as Elgato's CLI does it. If Stream Deck doesn't, the new version starts
 * the next time Stream Deck does.
 *
 * Only a build made by the release workflow updates itself: it carries
 * `bin/updates.json`, saying where its releases are and which version it
 * is. A copy linked for development, one built locally, and the one for
 * the Marketplace never do (nor read their own manifest, as Elgato's DRM
 * asks).
 *
 * (Only syntax Node can run as it is, so the tests run this file directly.)
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

export const UUID = "com.hasteclip.streamdeck";
/** The release's file: the plugin's folder, zipped. */
export const PACKAGE = `${UUID}.streamDeckPlugin`;
const FOLDER = `${UUID}.sdPlugin/`;

/** How often GitHub is asked for a newer release. */
const EVERY_MS = 6 * 60 * 60 * 1000;
/** How long after starting it's first asked. */
const FIRST_MS = 30 * 1000;
/** How long keys and dials have to be left alone for an update to go in. */
export const QUIET_MS = 2 * 60 * 1000;
/** How often an update waiting looks again whether it can go in. */
const RETRY_MS = 60 * 1000;

/** A release downloaded: its version, and its files by their place in the plugin's folder. */
export type Release = { version: string; files: Map<string, Uint8Array> };

export type Log = { info(message: string): void; warn(message: string): void };

/** A version's numbers: `v1.2.3`, `1.2.3` and `1.2.3.0` are all [1, 2, 3]. */
export function numbers(version: string): number[] | undefined {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:\.\d+)?$/.exec(version.trim());
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** Whether version `a` is newer than `b`. */
export function newer(a: string, b: string): boolean {
	const x = numbers(a);
	const y = numbers(b);
	if (!x || !y) return false;
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
	return false;
}

/** The most a package may hold, unpacked (it's about 250 KB). */
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * A zip's files by name, as Elgato's packer writes them: deflated (or
 * stored), with ZIP64 fields for sizes even where they're small, which
 * fflate and other small readers don't know.
 */
export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
	const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const broken = (why: string) => new Error(`the package is broken: ${why}`);
	// Its end: 22 bytes, then a comment of up to 64 KiB.
	let end = -1;
	for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
		if (data.readUInt32LE(i) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) throw broken("not a zip");
	const count = data.readUInt16LE(end + 10);
	let at = data.readUInt32LE(end + 16);
	if (count === 0xffff || at === 0xffffffff) throw broken("far too big");
	const files = new Map<string, Uint8Array>();
	let total = 0;
	for (let n = 0; n < count; n++) {
		if (at + 46 > data.length || data.readUInt32LE(at) !== 0x02014b50) throw broken("its list of files");
		const flags = data.readUInt16LE(at + 8);
		const method = data.readUInt16LE(at + 10);
		let packed = data.readUInt32LE(at + 20);
		let size = data.readUInt32LE(at + 24);
		const nameLength = data.readUInt16LE(at + 28);
		const extraLength = data.readUInt16LE(at + 30);
		const commentLength = data.readUInt16LE(at + 32);
		let local = data.readUInt32LE(at + 42);
		const name = data.toString("utf8", at + 46, at + 46 + nameLength);
		// ZIP64: each of size, packed size and place that's full (in that
		// order) is in its extra field.
		const extraEnd = at + 46 + nameLength + extraLength;
		for (let x = at + 46 + nameLength; x + 4 <= extraEnd; x += 4 + data.readUInt16LE(x + 2)) {
			if (data.readUInt16LE(x) !== 0x0001) continue;
			let p = x + 4;
			const next = () => {
				const value = Number(data.readBigUInt64LE(p));
				p += 8;
				return value;
			};
			if (size === 0xffffffff) size = next();
			if (packed === 0xffffffff) packed = next();
			if (local === 0xffffffff) local = next();
		}
		at = extraEnd + commentLength;
		if (name.endsWith("/")) continue;
		if (flags & 1) throw broken(`${name} is encrypted`);
		total += size;
		if (total > MAX_BYTES) throw broken("too big");
		if (local + 30 > data.length || data.readUInt32LE(local) !== 0x04034b50) throw broken(`where ${name} is`);
		const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
		if (start + packed > data.length) throw broken(`${name} is cut short`);
		const raw = data.subarray(start, start + packed);
		if (method !== 0 && method !== 8) throw broken(`${name} is packed a way this doesn't know`);
		const file = method === 0 ? raw : inflateRawSync(raw);
		if (file.length !== size) throw broken(`${name} isn't whole`);
		files.set(name, new Uint8Array(file));
	}
	return files;
}

/**
 * The plugin's files in a release's package, checked: all in the plugin's
 * folder (nothing that would land outside it), this plugin's manifest at
 * `version`, and its code.
 */
export function unpack(bytes: Uint8Array, version: string): Map<string, Uint8Array> {
	const files = new Map<string, Uint8Array>();
	for (const [name, data] of unzip(bytes)) {
		if (name.endsWith("/")) continue;
		if (!name.startsWith(FOLDER)) throw new Error(`the package has ${name}, outside the plugin`);
		const place = name.slice(FOLDER.length);
		const parts = place.split("/");
		if (place.includes("\\") || place.includes(":") || parts.some((p) => p === "" || p === "." || p === "..")) {
			throw new Error(`the package has a file in an odd place: ${name}`);
		}
		files.set(place, data);
	}
	const manifest = files.get("manifest.json");
	if (!manifest) throw new Error("the package has no manifest");
	const { UUID: uuid, Version: theirs } = JSON.parse(new TextDecoder().decode(manifest)) as { UUID?: string; Version?: string };
	if (uuid !== UUID) throw new Error(`the package is another plugin (${uuid})`);
	if (!theirs || newer(theirs, version) || newer(version, theirs)) throw new Error(`the package is ${theirs}, not ${version}`);
	if (!files.has("bin/plugin.js")) throw new Error("the package has no code");
	return files;
}

type GitHubRelease = { tag_name?: string; assets?: { name: string; browser_download_url: string; digest?: string | null }[] };

/** The latest release of `repo`, downloaded and checked, if it's newer than `current`. */
export async function fetchNewer(repo: string, current: string, get: typeof fetch = fetch): Promise<Release | undefined> {
	const headers = { "User-Agent": `hasteclip-streamdeck/${current}`, Accept: "application/vnd.github+json" };
	const answer = await get(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
	// No release yet.
	if (answer.status === 404) return undefined;
	if (!answer.ok) throw new Error(`GitHub answered ${answer.status}`);
	const release = (await answer.json()) as GitHubRelease;
	const version = release.tag_name ?? "";
	if (!numbers(version) || !newer(version, current)) return undefined;
	const asset = release.assets?.find((a) => a.name === PACKAGE);
	if (!asset) throw new Error(`${version} has no ${PACKAGE}`);
	const want = asset.digest?.startsWith("sha256:") ? asset.digest.slice("sha256:".length).toLowerCase() : undefined;
	if (!want) throw new Error(`${version} has no checksum to check it against`);
	const download = await get(asset.browser_download_url, { headers: { "User-Agent": headers["User-Agent"] } });
	if (!download.ok) throw new Error(`downloading ${version}: ${download.status}`);
	const bytes = new Uint8Array(await download.arrayBuffer());
	if (createHash("sha256").update(bytes).digest("hex") !== want) throw new Error(`${version} doesn't match its checksum`);
	const plain = numbers(version)!.join(".");
	return { version: plain, files: unpack(bytes, plain) };
}

/**
 * Put `release`'s files in the plugin's folder `dir`, each written beside
 * its old one and then moved over it, the code last (a stop half way
 * leaves the old code with what it can use).
 */
export async function install(release: Release, dir: string): Promise<void> {
	const root = path.resolve(dir);
	const order = [...release.files.keys()].sort((a, b) => Number(a === "bin/plugin.js") - Number(b === "bin/plugin.js"));
	for (const place of order) {
		const target = path.resolve(root, place);
		if (!target.startsWith(root + path.sep)) throw new Error(`${place} would land outside the plugin`);
		await fs.mkdir(path.dirname(target), { recursive: true });
		const fresh = `${target}.update`;
		await fs.writeFile(fresh, release.files.get(place)!);
		await fs.rename(fresh, target);
	}
}

/** Ask Stream Deck to start the plugin again, as Elgato's CLI does. */
function restart(): void {
	const link = `streamdeck://plugins/restart/${UUID}`;
	const [command, args] = process.platform === "win32" ? ["cmd.exe", ["/d", "/c", "start", "", link]] : ["open", [link]];
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
		child.on("error", () => {});
		child.unref();
	} catch {
		// It starts the new version the next time Stream Deck does.
	}
}

export type UpdaterOptions = {
	/** The plugin's folder (`com.hasteclip.streamdeck.sdPlugin`). */
	dir: string;
	log: Log;
	/** Whether an update now could lose something: recording, live, or a key used lately. */
	busy: () => boolean;
	/** For the tests: how to fetch, and how to start the plugin again. */
	get?: typeof fetch;
	restart?: () => void;
};

/** Checks for updates and puts them in place, as the top of this file says. */
export class Updater {
	#dir: string;
	#log: Log;
	#busy: () => boolean;
	#get: typeof fetch;
	#restart: () => void;
	#repo: string | undefined = undefined;
	#current = "";
	#pending: Release | undefined = undefined;
	#installing = false;
	#timer: NodeJS.Timeout | undefined = undefined;
	#retry: NodeJS.Timeout | undefined = undefined;

	constructor(options: UpdaterOptions) {
		this.#dir = options.dir;
		this.#log = options.log;
		this.#busy = options.busy;
		this.#get = options.get ?? fetch;
		this.#restart = options.restart ?? restart;
	}

	/** Start checking, if this is a release build installed in Stream Deck. */
	async start(): Promise<void> {
		try {
			const marker = JSON.parse(await fs.readFile(path.join(this.#dir, "bin", "updates.json"), "utf8")) as { repo?: string; version?: string };
			const version = numbers(marker.version ?? "");
			// Installed by Stream Deck: in its Plugins folder, not a linked copy elsewhere.
			const real = await fs.realpath(this.#dir);
			if (path.basename(path.dirname(real)) !== "Plugins" || !marker.repo || !version) return;
			this.#repo = marker.repo;
			this.#current = version.join(".");
		} catch {
			// A build of one's own: no updates.
			return;
		}
		this.#log.info(`Updates on, from ${this.#repo} (this is ${this.#current})`);
		this.#schedule(FIRST_MS);
	}

	/** Whether this build updates itself (known once `start` is done). */
	get on(): boolean {
		return this.#repo !== undefined;
	}

	stop(): void {
		clearTimeout(this.#timer);
		clearTimeout(this.#retry);
	}

	/** An update waiting goes in if nothing's going on, or looks again in a minute. */
	nudge(): void {
		clearTimeout(this.#retry);
		if (!this.#pending || this.#installing) return;
		if (!this.#busy()) {
			void this.#install();
			return;
		}
		this.#retry = setTimeout(() => this.nudge(), RETRY_MS);
		this.#retry.unref();
	}

	#schedule(ms: number): void {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.check(), ms);
		this.#timer.unref();
	}

	/** Ask GitHub now (and again in a few hours). */
	async check(): Promise<void> {
		this.#schedule(EVERY_MS);
		if (!this.#repo || this.#pending) {
			this.nudge();
			return;
		}
		try {
			const release = await fetchNewer(this.#repo, this.#current, this.#get);
			if (!release) return;
			this.#log.info(`HasteClip for Stream Deck ${release.version} downloaded; it goes in once nothing's going on`);
			this.#pending = release;
			this.nudge();
		} catch (e) {
			this.#log.warn(`Couldn't check for an update: ${e instanceof Error ? e.message : e}`);
		}
	}

	async #install(): Promise<void> {
		const release = this.#pending;
		if (!release) return;
		this.#installing = true;
		try {
			await install(release, this.#dir);
			this.#log.info(`Updated to ${release.version}; starting it`);
			this.#current = release.version;
			this.#pending = undefined;
			this.#restart();
		} catch (e) {
			// Tried again with the next check (downloaded afresh).
			this.#pending = undefined;
			this.#log.warn(`Couldn't put ${release.version} in place: ${e instanceof Error ? e.message : e}`);
		} finally {
			this.#installing = false;
		}
	}
}

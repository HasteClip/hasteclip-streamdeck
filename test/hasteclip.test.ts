/**
 * The connection to HasteClip, against a stand-in that speaks HasteClip's
 * side as its docs/control.md says: "ctrl", the hellos, the state, replies.
 */
import assert from "node:assert/strict";
import net from "node:net";
import { afterEach, test } from "node:test";

import { HasteClip, type State } from "../src/hasteclip.ts";

const STATE: State = {
	clipping: true,
	recording: false,
	streaming: false,
	clip_secs: 120,
	can_screenshot: true,
	can_stream: true,
	scene: 1,
	scenes: [{ id: 1, name: "Gameplay" }],
	preset: 1,
	presets: [{ id: 1, name: "Clipping" }],
	sources: [],
	sounds: [{ id: "src-mic", name: "Microphone", kind: "microphone", on: true, muted: false, db: 0 }],
};

/** A stand-in HasteClip: hears lines, answers as `answer` says. */
class FakeHasteClip {
	server: net.Server;
	clients = new Set<net.Socket>();
	heard: Record<string, unknown>[] = [];
	/** What it says to a request (undefined: nothing). */
	answer: (request: Record<string, unknown>) => Record<string, unknown> | undefined = (r) => ({ reply: r.id, ok: true });
	/** A HasteClip from before control: reads the word, and lets go. */
	old = false;
	/** As HasteClip 0.8.0 on Windows: lets a client go that's said nothing for this long. */
	quietMs: number | undefined = undefined;

	constructor() {
		this.server = net.createServer((socket) => this.#serve(socket));
	}

	listen(port = 0): Promise<number> {
		return new Promise((done) => this.server.listen(port, "127.0.0.1", () => done((this.server.address() as net.AddressInfo).port)));
	}

	close(): Promise<void> {
		for (const c of this.clients) c.destroy();
		return new Promise((done) => this.server.close(() => done()));
	}

	send(message: unknown): void {
		for (const c of this.clients) c.write(`${JSON.stringify(message)}\n`);
	}

	#serve(socket: net.Socket): void {
		this.clients.add(socket);
		socket.on("close", () => this.clients.delete(socket));
		socket.on("error", () => {});
		let buffer = "";
		let word = false;
		let quiet: NodeJS.Timeout | undefined;
		socket.on("close", () => clearTimeout(quiet));
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			if (this.quietMs !== undefined) {
				clearTimeout(quiet);
				quiet = setTimeout(() => socket.destroy(), this.quietMs);
			}
			buffer += chunk;
			if (!word) {
				if (buffer.length < 4) return;
				assert.equal(buffer.slice(0, 4), "ctrl");
				buffer = buffer.slice(4);
				word = true;
				if (this.old) {
					socket.destroy();
					return;
				}
			}
			for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
				const text = buffer.slice(0, end).trim();
				buffer = buffer.slice(end + 1);
				// Empty lines are skipped, as HasteClip skips them.
				if (!text) continue;
				const message = JSON.parse(text);
				this.heard.push(message);
				if ("hello" in message) {
					socket.write(`${JSON.stringify({ hello: 1, app: "HasteClip", version: "9.9.9" })}\n`);
					socket.write(`${JSON.stringify({ state: STATE })}\n`);
				} else {
					const reply = this.answer(message);
					if (reply) socket.write(`${JSON.stringify(reply)}\n`);
				}
			}
		});
	}
}

/** The next state heard (undefined: HasteClip went away). */
function nextState(hasteclip: HasteClip): Promise<State | undefined> {
	return new Promise((done) => {
		const stop = hasteclip.onState((state) => {
			stop();
			done(state);
		});
	});
}

const running: { hasteclip?: HasteClip; fake?: FakeHasteClip }[] = [];

afterEach(async () => {
	for (const r of running.splice(0)) {
		r.hasteclip?.stop();
		await r.fake?.close();
	}
});

async function connected(options: ConstructorParameters<typeof HasteClip>[0] = {}) {
	const fake = new FakeHasteClip();
	const port = await fake.listen();
	const hasteclip = new HasteClip({ port, retryMs: 100, ...options });
	running.push({ hasteclip, fake });
	const first = nextState(hasteclip);
	hasteclip.start();
	assert.deepEqual(await first, STATE);
	return { fake, hasteclip, port };
}

test("says hello, and hears HasteClip's state", async () => {
	const { fake, hasteclip } = await connected();
	assert.equal(hasteclip.version, "9.9.9");
	assert.deepEqual(fake.heard[0], { hello: 1, client: "Stream Deck" });
	// A new state, as HasteClip sends it when anything changes.
	const next = nextState(hasteclip);
	fake.send({ state: { ...STATE, recording: true, recording_secs: 3 } });
	assert.equal((await next)?.recording_secs, 3);
});

test("asks, and hears the answer to that request", async () => {
	const { fake, hasteclip } = await connected();
	fake.answer = (r) => (r.do === "save_clip" ? { reply: r.id, ok: false, why: "Clipping isn't on" } : { reply: r.id, ok: true });
	const [saved, shown] = await Promise.all([hasteclip.ask({ do: "save_clip" }), hasteclip.ask({ do: "scene", scene: 1 })]);
	assert.deepEqual(saved, { ok: false, why: "Clipping isn't on" });
	assert.deepEqual(shown, { ok: true, why: undefined });
	assert.deepEqual(
		fake.heard.slice(1).map(({ id, ...rest }) => (assert.equal(typeof id, "number"), rest)),
		[{ do: "save_clip" }, { do: "scene", scene: 1 }],
	);
});

test("an answer that doesn't come is late, not a failure", async () => {
	const { fake, hasteclip } = await connected({ replyMs: 100 });
	fake.answer = () => undefined;
	assert.deepEqual(await hasteclip.ask({ do: "open" }), { ok: false, why: "HasteClip didn't answer", late: true });
});

test("HasteClip quitting and starting again", async () => {
	const { fake, hasteclip, port } = await connected();
	fake.answer = () => undefined;
	const asked = hasteclip.ask({ do: "clipping" });
	const gone = nextState(hasteclip);
	await fake.close();
	assert.equal(await gone, undefined);
	assert.equal(hasteclip.state, undefined);
	assert.deepEqual(await asked, { ok: false, why: "HasteClip isn't running" });
	assert.deepEqual(await hasteclip.ask({ do: "clipping" }), { ok: false, why: "HasteClip isn't running" });

	// Started again on its port: found again.
	const again = new FakeHasteClip();
	running.push({ fake: again });
	await again.listen(port);
	assert.deepEqual(await nextState(hasteclip), STATE);
});

test("a HasteClip from before control needs an update", async () => {
	const fake = new FakeHasteClip();
	fake.old = true;
	const port = await fake.listen();
	const lines: string[] = [];
	const hasteclip = new HasteClip({ port, retryMs: 100, log: { info: (m) => lines.push(m) } });
	running.push({ hasteclip, fake });
	hasteclip.start();
	for (let i = 0; i < 100 && !hasteclip.tooOld; i++) await new Promise((r) => setTimeout(r, 10));
	assert.ok(hasteclip.tooOld);
	assert.deepEqual(await hasteclip.ask({ do: "save_clip" }), { ok: false, why: "HasteClip needs an update" });
	assert.ok(lines.some((l) => l.includes("update")));
});

test("a HasteClip that lets a quiet client go (0.8.0 on Windows) keeps it, with the empty lines", async () => {
	// Quiet past 300 ms, let go of; an empty line every 100 ms.
	const { fake, hasteclip } = await connected({ beatMs: 100 });
	for (const socket of fake.clients) socket.emit("data", "");
	fake.quietMs = 300;
	// Its quiet timer starts with what it hears next.
	for (const socket of fake.clients) socket.emit("data", "");
	let gone = 0;
	hasteclip.onState((state) => {
		if (state === undefined) gone++;
	});
	await new Promise((r) => setTimeout(r, 1200));
	assert.equal(gone, 0, "let go of");
	assert.deepEqual(hasteclip.state, STATE);
	assert.ok(fake.heard.length >= 1);
});

test("without the empty lines, that HasteClip lets it go (what the empty lines are for)", async () => {
	const { fake, hasteclip } = await connected({ beatMs: 60_000 });
	fake.quietMs = 300;
	for (const socket of fake.clients) socket.emit("data", "");
	const gone = nextState(hasteclip);
	assert.equal(await gone, undefined);
});

test("something else on the port that never says hello is let go of", async () => {
	const server = net.createServer(() => {});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
	const port = (server.address() as net.AddressInfo).port;
	const hasteclip = new HasteClip({ port, retryMs: 100, helloMs: 100 });
	hasteclip.start();
	await new Promise((r) => setTimeout(r, 300));
	assert.equal(hasteclip.state, undefined);
	hasteclip.stop();
	server.close();
});

/**
 * The connection to HasteClip, over its local port, as HasteClip's
 * docs/control.md describes: https://github.com/hasteclip/hasteclip/blob/main/docs/control.md
 *
 * It connects while HasteClip runs, and again whenever HasteClip starts
 * after quitting. It tells the actions what HasteClip is doing, and asks
 * HasteClip for what the keys and dials do.
 *
 * (Only syntax Node can run as it is, so the tests run this file directly.)
 */
import net from "node:net";

/** The port HasteClip holds while it runs. */
export const PORT = 52131;

/** The protocol version spoken. */
const PROTOCOL = 1;

/** A scene or a preset. */
export type Item = { id: number; name: string };

/** One of the preset's video sources. */
export type VideoSource = { id: string; name: string; kind: string; in_scene: boolean; on: boolean };

/** One of the preset's sounds. */
export type Sound = { id: string; name: string; kind: string; on: boolean; muted: boolean; db: number };

/** What HasteClip's doing. */
export type State = {
	clipping: boolean;
	recording: boolean;
	streaming: boolean;
	recording_secs?: number;
	stream_secs?: number;
	clip_secs: number;
	can_screenshot: boolean;
	can_stream: boolean;
	scene: number;
	scenes: Item[];
	preset: number;
	presets: Item[];
	sources: VideoSource[];
	sounds: Sound[];
};

/** What can be asked of HasteClip. */
export type Request =
	| { do: "save_clip" }
	| { do: "screenshot" }
	| { do: "mark" }
	| { do: "open" }
	| { do: "clipping"; on?: boolean }
	| { do: "recording"; on?: boolean }
	| { do: "stream"; on?: boolean }
	| { do: "scene"; scene?: number; step?: number }
	| { do: "preset"; preset: number }
	| { do: "source"; source: string; on?: boolean }
	| { do: "mute"; sound: string; muted?: boolean }
	| { do: "volume"; sound: string; db?: number; by?: number };

/** How a request went. `late`: no answer in time (HasteClip may still do it). */
export type Reply = { ok: boolean; why?: string; late?: boolean };

/** Where the connection says what happens. */
export type Log = { info(message: string): void };

type Waiting = { done: (reply: Reply) => void; timer: NodeJS.Timeout };

export type Options = {
	port?: number;
	host?: string;
	log?: Log;
	/** How long to wait for an answer before giving up on it. */
	replyMs?: number;
	/** How long HasteClip has to say hello once connected. */
	helloMs?: number;
	/** Longest wait between tries while HasteClip isn't running. */
	retryMs?: number;
	/** How often an empty line is sent while connected (see `#beat`). */
	beatMs?: number;
};

export class HasteClip {
	/** What HasteClip's doing; undefined while it isn't running. */
	state: State | undefined = undefined;
	/** HasteClip's version, once it's said hello. */
	version: string | undefined = undefined;
	/** The HasteClip running is from before control: it needs an update. */
	tooOld = false;
	/** Where what happens to the connection is said. */
	log: Log;
	/** When a key or dial last asked HasteClip for something (ms since the epoch). */
	lastAsked = 0;

	#port: number;
	#host: string;
	#replyMs: number;
	#helloMs: number;
	#retryMs: number;
	#socket: net.Socket | undefined = undefined;
	#connected = false;
	#hello = false;
	#buffer = "";
	#nextId = 1;
	#waiting = new Map<number, Waiting>();
	#listeners = new Set<(state: State | undefined) => void>();
	#retry: NodeJS.Timeout | undefined = undefined;
	#tries = 0;
	#helloTimer: NodeJS.Timeout | undefined = undefined;
	#running = false;
	#beatMs: number;
	/**
	 * An empty line, every couple of seconds while connected. HasteClip
	 * 0.8.0 on Windows lets a connection go that's said nothing for 5
	 * seconds (and a deck says nothing until a key's pressed): its keys went
	 * faint every 5 seconds. HasteClip skips empty lines, and hearing one
	 * keeps it listening. Later versions don't need it.
	 */
	#beat: NodeJS.Timeout | undefined = undefined;

	constructor(options: Options = {}) {
		this.#port = options.port ?? PORT;
		this.#host = options.host ?? "127.0.0.1";
		this.log = options.log ?? { info: () => {} };
		this.#replyMs = options.replyMs ?? 8000;
		this.#helloMs = options.helloMs ?? 5000;
		this.#retryMs = options.retryMs ?? 5000;
		this.#beatMs = options.beatMs ?? 2000;
	}

	/** Connect, and keep connecting whenever HasteClip runs. */
	start(): void {
		if (this.#running) return;
		this.#running = true;
		this.#connect();
	}

	/** Let go of HasteClip, and stop trying. */
	stop(): void {
		this.#running = false;
		clearTimeout(this.#retry);
		this.#socket?.destroy();
	}

	/** Hear each new state (undefined: HasteClip went away). */
	onState(listener: (state: State | undefined) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Ask HasteClip for `request`, and hear how it went. */
	ask(request: Request): Promise<Reply> {
		this.lastAsked = Date.now();
		const socket = this.#socket;
		if (!socket || !this.#hello) {
			return Promise.resolve({ ok: false, why: this.tooOld ? "HasteClip needs an update" : "HasteClip isn't running" });
		}
		const id = this.#nextId++;
		return new Promise((done) => {
			const timer = setTimeout(() => {
				this.#waiting.delete(id);
				done({ ok: false, why: "HasteClip didn't answer", late: true });
			}, this.#replyMs);
			this.#waiting.set(id, { done, timer });
			socket.write(`${JSON.stringify({ id, ...request })}\n`);
		});
	}

	#connect(): void {
		this.#retry = undefined;
		this.#connected = false;
		const socket = net.createConnection({ host: this.#host, port: this.#port });
		this.#socket = socket;
		socket.setNoDelay(true);
		socket.setEncoding("utf8");
		socket.on("connect", () => {
			this.#connected = true;
			socket.write(`ctrl${JSON.stringify({ hello: PROTOCOL, client: "Stream Deck" })}\n`);
			// Something else on the port says nothing: let go of it.
			this.#helloTimer = setTimeout(() => socket.destroy(), this.#helloMs);
		});
		socket.on("data", (chunk: string) => this.#received(socket, chunk));
		// "close" follows, which tries again.
		socket.on("error", () => {});
		socket.on("close", () => this.#closed(socket));
	}

	#received(socket: net.Socket, chunk: string): void {
		this.#buffer += chunk;
		// Lines this long aren't HasteClip's.
		if (this.#buffer.length > 1 << 20) {
			socket.destroy();
			return;
		}
		for (;;) {
			const end = this.#buffer.indexOf("\n");
			if (end < 0) break;
			const line = this.#buffer.slice(0, end).trim();
			this.#buffer = this.#buffer.slice(end + 1);
			if (!line) continue;
			let message: unknown;
			try {
				message = JSON.parse(line);
			} catch {
				continue;
			}
			if (message && typeof message === "object") this.#handle(message as Record<string, unknown>);
		}
	}

	#handle(message: Record<string, unknown>): void {
		if ("hello" in message) {
			clearTimeout(this.#helloTimer);
			this.#hello = true;
			this.#tries = 0;
			this.tooOld = false;
			this.version = typeof message.version === "string" ? message.version : undefined;
			this.log.info(`Connected to HasteClip ${this.version ?? ""}`.trim());
			const socket = this.#socket;
			clearInterval(this.#beat);
			this.#beat = setInterval(() => {
				if (socket?.writable) socket.write("\n");
			}, this.#beatMs);
			this.#beat.unref();
		} else if ("state" in message && this.#hello) {
			this.state = message.state as State;
			this.#tell();
		} else if ("reply" in message) {
			const waiting = this.#waiting.get(Number(message.reply));
			if (!waiting) return;
			this.#waiting.delete(Number(message.reply));
			clearTimeout(waiting.timer);
			waiting.done({ ok: message.ok === true, why: typeof message.why === "string" ? message.why : undefined });
		}
	}

	#closed(socket: net.Socket): void {
		if (socket !== this.#socket) return;
		clearTimeout(this.#helloTimer);
		clearInterval(this.#beat);
		// Connected, and let go of without a hello: a HasteClip from before
		// control (or something else on its port).
		if (this.#connected && !this.#hello && !this.tooOld) {
			this.tooOld = true;
			this.log.info("HasteClip is running, but it's too old for the Stream Deck: update it");
		}
		const wasHere = this.#hello;
		this.#socket = undefined;
		this.#buffer = "";
		this.#hello = false;
		for (const waiting of this.#waiting.values()) {
			clearTimeout(waiting.timer);
			waiting.done({ ok: false, why: "HasteClip isn't running" });
		}
		this.#waiting.clear();
		if (wasHere) this.log.info("HasteClip went away");
		if (this.state !== undefined) {
			this.state = undefined;
			this.#tell();
		}
		if (this.#running) {
			// Soon at first (HasteClip restarting), then every few seconds.
			const wait = Math.min(250 * 2 ** this.#tries, this.#retryMs);
			this.#tries++;
			this.#retry = setTimeout(() => this.#connect(), wait);
			this.#retry.unref();
		}
	}

	#tell(): void {
		for (const listener of this.#listeners) listener(this.state);
	}
}

/** The plugin's connection. */
export const hasteclip = new HasteClip();

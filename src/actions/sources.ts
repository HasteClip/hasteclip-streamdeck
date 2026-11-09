/** Sources: showing and hiding the video's, muting and turning up the sounds. */
import { action, type DialAction, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type KeyUpEvent, type TouchTapEvent } from "@elgato/streamdeck";

import { HasteClipAction, image, listed, type Look, type MenuItem, type Settings, wanted } from "../action";
import { hasteclip, type Sound as SoundState, type State } from "../hasteclip";

type SourceSettings = Settings & {
	/** A video source's id: `screen`, `webcam:<key>`, `visual:<key>`. */
	source?: string;
	sourceName?: string;
};

/** Show or hide a video source in the scene shown; lit while it's shown. */
@action({ UUID: "com.hasteclip.streamdeck.source" })
export class Source extends HasteClipAction<SourceSettings> {
	protected override look(settings: SourceSettings, state: State | undefined): Look {
		const source = state?.sources.find((s) => s.id === settings.source);
		// Not running, gone, or not in this scene: nothing to show or hide.
		if (!source || !source.in_scene) return { state: 0, title: source?.name ?? settings.sourceName, image: image("imgs/actions/source/dim") };
		return { state: source.on ? 1 : 0, title: source.name };
	}

	protected override menu(name: string, state: State | undefined): MenuItem[] | undefined {
		return name === "sources" ? listed(state?.sources, "sources") : undefined;
	}

	override async onKeyDown(ev: KeyDownEvent<SourceSettings>): Promise<void> {
		const source = ev.payload.settings.source;
		if (!source) {
			await ev.action.showAlert();
			return;
		}
		await this.answer(ev.action, await hasteclip.ask({ do: "source", source, on: wanted(ev) }));
	}
}

type SoundSettings = Settings & {
	/** A sound's id. */
	sound?: string;
	soundName?: string;
	/** What a press does: mute or unmute (`toggle`), or unmute (`talk`) or mute (`mute`) while held. */
	press?: "toggle" | "talk" | "mute";
};

/** How much a dial's step turns a sound up or down. */
const STEP_DB = 1;

/** The fader's range, as HasteClip's mixer has it. */
const MIN_DB = -60;
const MAX_DB = 12;

/**
 * A sound: a key mutes and unmutes it (or holds it unmuted, push to talk,
 * or muted); a dial turns it up and down, and a push or a tap mutes it.
 * Lit red while it's muted.
 */
@action({ UUID: "com.hasteclip.streamdeck.sound" })
export class Sound extends HasteClipAction<SoundSettings> {
	protected override look(settings: SoundSettings, state: State | undefined, dial: boolean): Look {
		const sound = state?.sounds.find((s) => s.id === settings.sound);
		const name = sound?.name ?? settings.soundName ?? "Sound";
		return dial ? dialLook(sound, name) : keyLook(sound, name);
	}

	protected override menu(name: string, state: State | undefined): MenuItem[] | undefined {
		return name === "sounds" ? listed(state?.sounds, "sounds") : undefined;
	}

	override async onKeyDown(ev: KeyDownEvent<SoundSettings>): Promise<void> {
		const { sound, press = "toggle" } = ev.payload.settings;
		if (!sound) {
			await ev.action.showAlert();
			return;
		}
		const muted = press === "talk" ? false : press === "mute" ? true : wanted(ev);
		await this.answer(ev.action, await hasteclip.ask({ do: "mute", sound, muted }));
	}

	/** Push to talk (or to mute): let go, back as it was. */
	override async onKeyUp(ev: KeyUpEvent<SoundSettings>): Promise<void> {
		const { sound, press = "toggle" } = ev.payload.settings;
		if (!sound || press === "toggle") return;
		await this.answer(ev.action, await hasteclip.ask({ do: "mute", sound, muted: press === "talk" }));
	}

	override async onDialRotate(ev: DialRotateEvent<SoundSettings>): Promise<void> {
		const sound = ev.payload.settings.sound;
		if (!sound) {
			await ev.action.showAlert();
			return;
		}
		await this.answer(ev.action, await hasteclip.ask({ do: "volume", sound, by: ev.payload.ticks * STEP_DB }));
	}

	override onDialDown(ev: DialDownEvent<SoundSettings>): Promise<void> {
		return this.#toggle(ev.action, ev.payload.settings);
	}

	override onTouchTap(ev: TouchTapEvent<SoundSettings>): Promise<void> {
		return this.#toggle(ev.action, ev.payload.settings);
	}

	async #toggle(action: DialAction<SoundSettings>, settings: SoundSettings): Promise<void> {
		if (!settings.sound) {
			await action.showAlert();
			return;
		}
		await this.answer(action, await hasteclip.ask({ do: "mute", sound: settings.sound }));
	}
}

/** A microphone's own pictures, or a speaker's for the computer's, an app's or a video's sound. */
function pictures(sound: SoundState | undefined): "mic" | "speaker" {
	return !sound || sound.kind === "microphone" ? "mic" : "speaker";
}

function keyLook(sound: SoundState | undefined, name: string): Look {
	const kind = pictures(sound);
	// Not running, gone, or switched off on the Sources page.
	if (!sound || !sound.on) return { state: 0, title: name, image: image(`imgs/actions/sound/${kind}-dim`) };
	// A microphone has the key's own two pictures; others, a speaker's.
	const own = kind === "mic" ? undefined : image(`imgs/actions/sound/speaker${sound.muted ? "-muted" : ""}`);
	return { state: sound.muted ? 1 : 0, title: name, image: own };
}

function dialLook(sound: SoundState | undefined, name: string): Look {
	const kind = pictures(sound);
	const off = !sound || !sound.on;
	const muted = sound?.muted ?? false;
	const icon = image(`imgs/actions/sound/dial-${kind}${muted ? "-muted" : ""}`);
	const value = !sound ? "Not running" : !sound.on ? "Off" : muted ? "Muted" : dbText(sound.db);
	const color = off ? "#6E7179" : muted ? "#FF5050" : "#FFFFFF";
	const db = sound?.db ?? MIN_DB;
	return {
		feedback: {
			title: name,
			icon,
			value: { value, color },
			indicator: { value: Math.round(((db - MIN_DB) / (MAX_DB - MIN_DB)) * 100), bar_fill_c: off || muted ? "#6E7179" : "#3DD68C" },
		},
	};
}

/** A volume as HasteClip's mixer writes it: −∞ dB, 0.0 dB, +3.0 dB, −6.5 dB. */
export function dbText(db: number): string {
	if (db <= MIN_DB + 0.05) return "−∞ dB";
	if (Math.abs(db) < 0.05) return "0.0 dB";
	return `${db > 0 ? "+" : "−"}${Math.abs(db).toFixed(1)} dB`;
}

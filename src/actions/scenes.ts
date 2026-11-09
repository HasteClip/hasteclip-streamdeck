/** Scenes and presets: switching to one, by key or by dial. */
import { action, type DialAction, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type TouchTapEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { HasteClipAction, image, listed, type Look, type MenuItem, type Settings } from "../action";
import { hasteclip, type Request, type State } from "../hasteclip";

type SceneSettings = Settings & {
	/** A scene's id, or `next` or `previous`. */
	scene?: string;
	/** Its name when it was picked (shown while HasteClip isn't running). */
	sceneName?: string;
};

/** Show a scene (or the next one, or the one before); lit while it's the one shown. */
@action({ UUID: "com.hasteclip.streamdeck.scene" })
export class Scene extends HasteClipAction<SceneSettings> {
	protected override look(settings: SceneSettings, state: State | undefined): Look {
		const dim = image("imgs/actions/scene/dim");
		if (settings.scene === "next" || settings.scene === "previous") {
			return { state: 0, title: settings.scene === "next" ? "Next\nscene" : "Previous\nscene", image: state ? undefined : dim };
		}
		const id = Number(settings.scene);
		const scene = state?.scenes.find((s) => s.id === id);
		if (!state || !scene) return { state: 0, title: settings.sceneName, image: dim };
		return { state: state.scene === id ? 1 : 0, title: scene.name };
	}

	protected override menu(name: string, state: State | undefined): MenuItem[] | undefined {
		if (name !== "scenes") return undefined;
		return [
			{ label: "Go through", children: [ { value: "next", label: "Next scene" }, { value: "previous", label: "Previous scene" } ] },
			{ label: "Scenes", children: listed(state?.scenes, "scenes") },
		];
	}

	override async onKeyDown(ev: KeyDownEvent<SceneSettings>): Promise<void> {
		const pick = ev.payload.settings.scene;
		let request: Request;
		if (pick === "next") request = { do: "scene", step: 1 };
		else if (pick === "previous") request = { do: "scene", step: -1 };
		else if (pick && !Number.isNaN(Number(pick))) request = { do: "scene", scene: Number(pick) };
		else {
			await ev.action.showAlert();
			return;
		}
		await this.answer(ev.action, await hasteclip.ask(request));
	}
}

/** How long a dial's pick waits to be shown before it goes back. */
const PICK_MS = 4000;

/**
 * Stream Deck +: turn to pick a scene, push (or tap) to show it. Turning
 * alone doesn't switch, so the scenes on the way aren't flashed on stream;
 * a pick that isn't shown goes back after a few seconds.
 */
@action({ UUID: "com.hasteclip.streamdeck.scenes" })
export class Scenes extends HasteClipAction {
	/** Each dial's pick, and when it goes back. */
	readonly #picks = new Map<string, { scene: number; timer: NodeJS.Timeout }>();

	protected override look(_: Settings, state: State | undefined, _dial: boolean, id: string): Look {
		const icon = image("imgs/actions/scenes/dial");
		const text = (value: string, color = "#FFFFFF") => ({ value, color });
		if (!state) return { feedback: { title: "Scene", value: text("Not running", "#6E7179"), icon } };
		const pick = this.#picks.get(id);
		const picked = pick && pick.scene !== state.scene ? state.scenes.find((s) => s.id === pick.scene) : undefined;
		if (picked) return { feedback: { title: "Push to show", value: text(picked.name, "#F2B544"), icon } };
		return { feedback: { title: "Scene", value: text(state.scenes.find((s) => s.id === state.scene)?.name ?? ""), icon } };
	}

	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const state = hasteclip.state;
		if (!state || state.scenes.length === 0) {
			await ev.action.showAlert();
			return;
		}
		const ids = state.scenes.map((s) => s.id);
		const from = this.#picks.get(ev.action.id)?.scene ?? state.scene;
		const at = Math.max(0, ids.indexOf(from));
		const n = ids.length;
		this.#pick(ev.action, ids[(((at + ev.payload.ticks) % n) + n) % n]);
	}

	override onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		return this.#show(ev.action);
	}

	override onTouchTap(ev: TouchTapEvent<Settings>): Promise<void> {
		return this.#show(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.#forget(ev.action.id);
		super.onWillDisappear(ev);
	}

	#pick(action: DialAction<Settings>, scene: number): void {
		this.#forget(action.id);
		const timer = setTimeout(() => {
			this.#picks.delete(action.id);
			void this.draw(action.id);
		}, PICK_MS);
		this.#picks.set(action.id, { scene, timer });
		void this.draw(action.id);
	}

	#forget(id: string): void {
		clearTimeout(this.#picks.get(id)?.timer);
		this.#picks.delete(id);
	}

	async #show(action: DialAction<Settings>): Promise<void> {
		const pick = this.#picks.get(action.id);
		if (!pick) return;
		this.#forget(action.id);
		await this.answer(action, await hasteclip.ask({ do: "scene", scene: pick.scene }));
		await this.draw(action.id);
	}
}

type PresetSettings = Settings & {
	/** A preset's id. */
	preset?: string;
	presetName?: string;
};

/**
 * Use a preset; lit while it's the one in use. While only clipping,
 * HasteClip asks first in its window (clipping starts again); while
 * recording or live it can't.
 */
@action({ UUID: "com.hasteclip.streamdeck.preset" })
export class Preset extends HasteClipAction<PresetSettings> {
	protected override look(settings: PresetSettings, state: State | undefined): Look {
		const id = Number(settings.preset);
		const preset = state?.presets.find((p) => p.id === id);
		if (!state || !preset) return { state: 0, title: settings.presetName, image: image("imgs/actions/preset/dim") };
		return { state: state.preset === id ? 1 : 0, title: preset.name };
	}

	protected override menu(name: string, state: State | undefined): MenuItem[] | undefined {
		return name === "presets" ? listed(state?.presets, "presets") : undefined;
	}

	override async onKeyDown(ev: KeyDownEvent<PresetSettings>): Promise<void> {
		const id = Number(ev.payload.settings.preset);
		if (!ev.payload.settings.preset || Number.isNaN(id)) {
			await ev.action.showAlert();
			return;
		}
		await this.answer(ev.action, await hasteclip.ask({ do: "preset", preset: id }));
	}
}

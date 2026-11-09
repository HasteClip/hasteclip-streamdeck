import streamDeck, {
	type DialAction,
	type DidReceiveSettingsEvent,
	type FeedbackPayload,
	type KeyAction,
	type KeyDownEvent,
	type PropertyInspectorDidAppearEvent,
	type PropertyInspectorDidDisappearEvent,
	type SendToPluginEvent,
	SingletonAction,
	type TitleParametersDidChangeEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { readFileSync } from "node:fs";

import { hasteclip, type Reply, type State } from "./hasteclip";

/** What every action keeps: whether its key's title is the user's own. */
export type Settings = { ownTitle?: boolean };

/** How a key or dial looks now. */
export type Look = {
	/** Two-state actions: 0 off, 1 on. */
	state?: 0 | 1;
	/** Words on the key; undefined leaves the user's own title (if any). */
	title?: string;
	/** An image instead of the state's own (see `image`), e.g. dimmed while it can't be used. */
	image?: string;
	/** Stream Deck +: what the dial's part of the touch strip shows. */
	feedback?: FeedbackPayload;
};

/** An item in a property inspector's menu (sdpi-components' data source). */
export type MenuItem = { value: string; label?: string; disabled?: boolean } | { label?: string; children: MenuItem[] };

/** What was last sent for a key or dial, so only changes are sent. */
type Shown = { state?: 0 | 1; title?: string | null; image?: string | null; feedback?: string };

type Seen<T extends JsonObject> = { action: KeyAction<T> | DialAction<T>; settings: T; shown: Shown };

/**
 * An action that shows what HasteClip's doing: each of its keys and dials is
 * drawn again whenever that changes, sending Stream Deck only what changed.
 */
export abstract class HasteClipAction<T extends JsonObject & Settings = Settings> extends SingletonAction<T> {
	readonly #seen = new Map<string, Seen<T>>();
	/** The key whose settings are open, if one of this action's is. */
	#inspected: string | undefined;
	/** The menus last sent to its settings. */
	#menus = new Map<string, string>();

	constructor() {
		super();
		hasteclip.onState(() => this.redraw());
	}

	/**
	 * How a key or dial (`id`) with `settings` looks while HasteClip's doing
	 * `state` (undefined: not running).
	 */
	protected abstract look(settings: T, state: State | undefined, dial: boolean, id: string): Look;

	/** The items of a menu in this action's settings, by its data source's name. */
	protected menu(_name: string, _state: State | undefined): MenuItem[] | undefined {
		return undefined;
	}

	override onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
		this.#seen.set(ev.action.id, { action: ev.action, settings: ev.payload.settings, shown: {} });
		return this.draw(ev.action.id);
	}

	override onWillDisappear(ev: WillDisappearEvent<T>): void {
		this.#seen.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
		const seen = this.#seen.get(ev.action.id);
		if (seen) seen.settings = ev.payload.settings;
		return this.draw(ev.action.id);
	}

	/**
	 * The title was changed in Stream Deck: to words of the user's own (not
	 * the ones put there here), which are then left alone, or to nothing,
	 * which puts the action's own words back.
	 */
	override async onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<T>): Promise<void> {
		const seen = this.#seen.get(ev.action.id);
		if (!seen || seen.shown.title === undefined) return;
		const ours = seen.shown.title ?? "";
		const own = ev.payload.title !== "" && ev.payload.title !== ours;
		if (own === Boolean(seen.settings.ownTitle)) return;
		seen.settings = { ...seen.settings, ownTitle: own };
		await ev.action.setSettings(seen.settings);
		if (!own) {
			seen.shown.title = undefined;
			await this.draw(ev.action.id);
		}
	}

	override onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<T>): void {
		this.#inspected = ev.action.id;
		this.#menus.clear();
	}

	override onPropertyInspectorDidDisappear(ev: PropertyInspectorDidDisappearEvent<T>): void {
		if (this.#inspected === ev.action.id) this.#inspected = undefined;
	}

	/** A menu in the settings asks for its items. */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
		const payload = ev.payload;
		if (payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.event === "string") {
			this.#menus.delete(payload.event);
			await this.#sendMenu(payload.event);
		}
	}

	/** Send a menu's items to the settings open, if they changed. */
	async #sendMenu(name: string): Promise<void> {
		const items = this.menu(name, hasteclip.state);
		if (!items) return;
		const json = JSON.stringify(items);
		if (this.#menus.get(name) === json) return;
		this.#menus.set(name, json);
		await streamDeck.ui.sendToPropertyInspector({ event: name, items });
	}

	/** Draw every key and dial of this action again (and its open settings' menus). */
	protected redraw(): void {
		for (const id of this.#seen.keys()) void this.draw(id);
		if (this.#inspected) for (const name of this.#menus.keys()) void this.#sendMenu(name).catch(() => {});
	}

	protected async draw(id: string): Promise<void> {
		const seen = this.#seen.get(id);
		if (!seen) return;
		const { action, shown } = seen;
		// A key in a multi-action isn't on the deck to be drawn.
		if (action.isKey() && action.isInMultiAction()) return;
		try {
			const look = this.look(seen.settings, hasteclip.state, action.isDial(), id);
			if (action.isKey()) {
				if (look.state !== undefined && shown.state !== look.state) {
					shown.state = look.state;
					await action.setState(look.state);
				}
				if (shown.image !== (look.image ?? null)) {
					shown.image = look.image ?? null;
					await action.setImage(look.image);
				}
				if (!seen.settings.ownTitle && shown.title !== (look.title ?? null)) {
					shown.title = look.title ?? null;
					await action.setTitle(look.title);
				}
			} else if (action.isDial() && look.feedback) {
				const feedback = JSON.stringify(look.feedback);
				if (shown.feedback !== feedback) {
					shown.feedback = feedback;
					await action.setFeedback(look.feedback);
				}
			}
		} catch (e) {
			streamDeck.logger.warn(`Couldn't draw ${this.manifestId}: ${e}`);
		}
	}

	/** Show how a press went: a tick when it's done (if `tick`), a warning when it isn't. */
	protected async answer(action: KeyAction<T> | DialAction<T>, reply: Reply, tick = false): Promise<void> {
		if (reply.ok) {
			if (tick && action.isKey()) await action.showOk();
		} else if (!reply.late) {
			streamDeck.logger.info(`${this.manifestId}: ${reply.why ?? "not done"}`);
			await action.showAlert();
		}
	}
}

/**
 * What a two-state key's press asks for: in a multi-action, the state the
 * user chose for it there (1 on, 0 off); else undefined, the other way.
 */
export function wanted<T extends JsonObject>(ev: KeyDownEvent<T>): boolean | undefined {
	return ev.payload.isInMultiAction ? ev.payload.userDesiredState === 1 : undefined;
}

const images = new Map<string, string>();

/** An image of the plugin's (`imgs/…`, without `.svg`), as code hands it to Stream Deck. */
export function image(path: string): string | undefined {
	let data = images.get(path);
	if (data === undefined) {
		try {
			data = `data:image/svg+xml;base64,${readFileSync(new URL(`../${path}.svg`, import.meta.url)).toString("base64")}`;
		} catch (e) {
			streamDeck.logger.warn(`No image ${path}: ${e}`);
			return undefined;
		}
		images.set(path, data);
	}
	return data;
}

/** A time since something started: 0:42, 12:03, 1:02:03. */
export function since(secs: number | undefined): string | undefined {
	if (secs === undefined) return undefined;
	const h = Math.floor(secs / 3600);
	const m = Math.floor((secs % 3600) / 60);
	const s = Math.floor(secs % 60);
	const two = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** The menu of items the user picks one of, or a word that HasteClip isn't there to list them. */
export function listed(items: { id: number | string; name: string }[] | undefined, what: string): MenuItem[] {
	if (!items) return [{ value: "", label: `Open HasteClip to list its ${what}`, disabled: true }];
	return items.map((i) => ({ value: String(i.id), label: i.name }));
}

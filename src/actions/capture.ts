/**
 * The keys for what HasteClip captures: saving a clip, clipping, recording,
 * streaming, screenshots, marking the moment.
 */
import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { HasteClipAction, image, type Look, type Settings, since, wanted } from "../action";
import { hasteclip, type State } from "../hasteclip";

/** Save a clip while clipping. While recording it marks the moment too, as the shortcut does. */
@action({ UUID: "com.hasteclip.streamdeck.save-clip" })
export class SaveClip extends HasteClipAction {
	protected override look(_: Settings, state: State | undefined): Look {
		return { image: state && (state.clipping || state.recording) ? undefined : image("imgs/actions/save-clip/dim") };
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		await this.answer(ev.action, await hasteclip.ask({ do: "save_clip" }), true);
	}
}

/** Start or stop clipping (the replay buffer). */
@action({ UUID: "com.hasteclip.streamdeck.clipping" })
export class Clipping extends HasteClipAction {
	protected override look(_: Settings, state: State | undefined): Look {
		if (!state) return { state: 0, image: image("imgs/actions/clipping/dim") };
		return { state: state.clipping ? 1 : 0 };
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		await this.answer(ev.action, await hasteclip.ask({ do: "clipping", on: wanted(ev) }));
	}
}

/** Start or stop recording; the time it's been going, while it is. */
@action({ UUID: "com.hasteclip.streamdeck.recording" })
export class Recording extends HasteClipAction {
	protected override look(_: Settings, state: State | undefined): Look {
		if (!state) return { state: 0, image: image("imgs/actions/recording/dim") };
		return { state: state.recording ? 1 : 0, title: state.recording ? since(state.recording_secs) : undefined };
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		await this.answer(ev.action, await hasteclip.ask({ do: "recording", on: wanted(ev) }));
	}
}

/**
 * Go live, or end the stream; the time it's been live, while it is. Going
 * live is asked first in HasteClip's window, as it always is there.
 */
@action({ UUID: "com.hasteclip.streamdeck.stream" })
export class Stream extends HasteClipAction {
	protected override look(_: Settings, state: State | undefined): Look {
		if (!state || !state.can_stream) return { state: 0, image: image("imgs/actions/stream/dim") };
		return { state: state.streaming ? 1 : 0, title: state.streaming ? since(state.stream_secs) : undefined };
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		await this.answer(ev.action, await hasteclip.ask({ do: "stream", on: wanted(ev) }));
	}
}

/** Take a screenshot. */
@action({ UUID: "com.hasteclip.streamdeck.screenshot" })
export class Screenshot extends HasteClipAction {
	protected override look(_: Settings, state: State | undefined): Look {
		return { image: state?.can_screenshot ? undefined : image("imgs/actions/screenshot/dim") };
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		await this.answer(ev.action, await hasteclip.ask({ do: "screenshot" }), true);
	}
}

/** Mark the moment in the recording, to find it again later. */
@action({ UUID: "com.hasteclip.streamdeck.mark" })
export class Mark extends HasteClipAction {
	protected override look(_: Settings, state: State | undefined): Look {
		return { image: state?.recording ? undefined : image("imgs/actions/mark/dim") };
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		await this.answer(ev.action, await hasteclip.ask({ do: "mark" }), true);
	}
}

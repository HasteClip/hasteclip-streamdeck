import streamDeck, { action, type KeyDownEvent } from "@elgato/streamdeck";
import { spawn } from "node:child_process";
import path from "node:path";

import { HasteClipAction, type Look, type Settings } from "../action";
import { hasteclip } from "../hasteclip";

/**
 * HasteClip's window, in front. While it isn't running it's started (a
 * second start of HasteClip only shows the one running, so that's safe
 * with one from before control too).
 */
@action({ UUID: "com.hasteclip.streamdeck.open" })
export class Open extends HasteClipAction {
	protected override look(): Look {
		return {};
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		if (hasteclip.state) {
			await this.answer(ev.action, await hasteclip.ask({ do: "open" }));
		} else if (!start()) {
			await ev.action.showAlert();
		}
	}
}

/** Start HasteClip where its installer puts it. Whether it could be. */
function start(): boolean {
	const [command, args] = launcher();
	if (!command) {
		streamDeck.logger.info("Don't know how to start HasteClip here");
		return false;
	}
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false });
		child.on("error", (e) => streamDeck.logger.info(`Couldn't start HasteClip: ${e.message}`));
		child.unref();
		return true;
	} catch (e) {
		streamDeck.logger.info(`Couldn't start HasteClip: ${e}`);
		return false;
	}
}

function launcher(): [string | undefined, string[]] {
	switch (process.platform) {
		// Its installer's launcher, which runs the version installed now.
		case "win32":
			return process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "HasteClip", "HasteClip.exe"), []] : [undefined, []];
		case "darwin":
			return ["open", ["-b", "io.github.kaillr.HasteClip"]];
		default:
			return ["hasteclip", []];
	}
}

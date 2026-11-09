/**
 * HasteClip for the Stream Deck. Each key and dial asks HasteClip (over its
 * local port, see `hasteclip.ts`) and shows what it's doing.
 */
import streamDeck from "@elgato/streamdeck";
import { fileURLToPath } from "node:url";

import { Clipping, Mark, Recording, SaveClip, Screenshot, Stream } from "./actions/capture";
import { Open } from "./actions/open";
import { Preset, Scene, Scenes } from "./actions/scenes";
import { Sound, Source } from "./actions/sources";
import { hasteclip } from "./hasteclip";
import { QUIET_MS, Updater } from "./update";

streamDeck.logger.setLevel("info");

for (const action of [new SaveClip(), new Clipping(), new Recording(), new Stream(), new Screenshot(), new Mark(), new Scene(), new Scenes(), new Preset(), new Source(), new Sound(), new Open()]) {
	streamDeck.actions.registerAction(action);
}

// What happens to the connection, in the plugin's log.
const log = { info: (message: string) => streamDeck.logger.info(message), warn: (message: string) => streamDeck.logger.warn(message) };
hasteclip.log = log;
hasteclip.start();

// Updates (release builds installed from GitHub): never while recording or
// live, or while the deck's being used.
const updater = new Updater({
	dir: fileURLToPath(new URL("..", import.meta.url)),
	log,
	busy: () => Boolean(hasteclip.state?.recording || hasteclip.state?.streaming) || Date.now() - hasteclip.lastAsked < QUIET_MS,
});
hasteclip.onState(() => updater.nudge());
void updater.start();

streamDeck.connect();

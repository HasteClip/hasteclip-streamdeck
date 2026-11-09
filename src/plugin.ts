/**
 * HasteClip for the Stream Deck. Each key and dial asks HasteClip (over its
 * local port, see `hasteclip.ts`) and shows what it's doing.
 */
import streamDeck from "@elgato/streamdeck";

import { Clipping, Mark, Recording, SaveClip, Screenshot, Stream } from "./actions/capture";
import { Open } from "./actions/open";
import { Preset, Scene, Scenes } from "./actions/scenes";
import { Sound, Source } from "./actions/sources";
import { hasteclip } from "./hasteclip";

streamDeck.logger.setLevel("info");

for (const action of [new SaveClip(), new Clipping(), new Recording(), new Stream(), new Screenshot(), new Mark(), new Scene(), new Scenes(), new Preset(), new Source(), new Sound(), new Open()]) {
	streamDeck.actions.registerAction(action);
}

// What happens to the connection, in the plugin's log.
hasteclip.log = { info: (message) => streamDeck.logger.info(message) };
hasteclip.start();
streamDeck.connect();

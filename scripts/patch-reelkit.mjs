import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const reelkitCore = fileURLToPath(new URL("../node_modules/@reelkit/core/dist/index.js", import.meta.url));
const source = await readFile(reelkitCore, "utf8");
const forcedCors = 't.crossOrigin = "anonymous", ';

// ReelKit forces anonymous CORS on every video. R2 custom-domain media does
// not need canvas access, and forcing CORS makes otherwise valid MP4 playback
// fail when an edge response omits ACAO. Keep native video delivery instead.
if (source.includes(forcedCors)) {
  await writeFile(reelkitCore, source.replace(forcedCors, ""));
  console.log("Patched ReelKit native video loading.");
} else {
  console.log("ReelKit native video loading already patched.");
}

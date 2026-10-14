import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const source = JSON.parse(await readFile(path.join(workspaceRoot, "data", "actresses.json"), "utf8"));
const names = [...new Set(source.map((name) => String(name).trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));
const outputDir = path.join(projectRoot, "src", "lib", "admin");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "all-actresses.generated.json"), `${JSON.stringify(names)}\n`, "utf8");
console.log(`Admin actress directory generated: ${names.length} names.`);

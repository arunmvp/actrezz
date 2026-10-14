import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const item = process.argv[i];
  if (!item.startsWith("--")) continue;
  const key = item.slice(2);
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) args.set(key, "true");
  else {
    args.set(key, next);
    i++;
  }
}

const appRoot = process.cwd();
const inputRoot = path.resolve(args.get("input") || path.join(appRoot, "..", "downloads"));
const outputRoot = path.resolve(args.get("output") || path.join(appRoot, "..", "compressed-videos"));
const targetGb = Number(args.get("target-gb") || "9.2");
const sampleCount = Number(args.get("sample") || "0");
const force = args.get("force") === "true";
const dryRun = args.get("dry-run") === "true";
const maxHeight = Number(args.get("max-height") || "480");
const audioKbps = Number(args.get("audio-kbps") || "48");
const preset = args.get("preset") || "slow";
const workers = Math.max(1, Math.min(Number(args.get("workers") || "1"), Math.max(1, os.cpus().length - 1), 8));
const reportPath = path.join(outputRoot, "compression-report.jsonl");
const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(mp4|webm|mkv|mov|m4v)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: options.stdio || "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stderr || stdout}`));
    });
  });
}

async function probe(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const json = JSON.parse(stdout);
  const video = json.streams.find((stream) => stream.codec_type === "video");
  const audio = json.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(json.format.duration || video?.duration || 0);
  const bitRate = Number(json.format.bit_rate || 0) / 1000;
  return {
    duration,
    bitRate,
    hasAudio: Boolean(audio),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
  };
}

function even(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function outputPathFor(file) {
  const relative = path.relative(inputRoot, file);
  return path.join(outputRoot, relative.replace(/\.[^.]+$/, ".mp4"));
}

function appendReport(row) {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.appendFileSync(reportPath, `${JSON.stringify(row)}\n`);
}

const files = walk(inputRoot).sort();
if (!files.length) {
  console.error(`No videos found in ${inputRoot}`);
  process.exit(1);
}

console.log(`Scanning ${files.length} video(s) from ${inputRoot}`);

const infos = [];
let totalDuration = 0;
let totalOriginalBytes = 0;
for (const file of files) {
  const stat = fs.statSync(file);
  const info = await probe(file);
  info.file = file;
  info.bytes = stat.size;
  infos.push(info);
  totalDuration += info.duration;
  totalOriginalBytes += stat.size;
}

const selectedInfos = sampleCount > 0 ? infos.slice(0, sampleCount) : infos;
const targetBytes = targetGb * 1024 ** 3;
const targetTotalKbps = Math.floor((targetBytes * 8) / Math.max(1, totalDuration) / 1000);
const projectedGb = (targetBytes / 1024 ** 3).toFixed(2);
console.log(`Original: ${(totalOriginalBytes / 1024 ** 3).toFixed(2)} GiB, duration: ${(totalDuration / 3600).toFixed(2)} hours`);
console.log(`Target: ${projectedGb} GiB, average total bitrate: ${targetTotalKbps} kbps`);

if (dryRun) {
  for (const info of selectedInfos.slice(0, 20)) {
    const videoKbps = Math.max(140, targetTotalKbps - (info.hasAudio ? audioKbps : 0));
    console.log(`${path.relative(inputRoot, info.file)} -> ${videoKbps}k video${info.hasAudio ? ` + ${audioKbps}k audio` : ""}`);
  }
  console.log("Dry run only. Remove --dry-run to compress.");
  process.exit(0);
}

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(reportPath, "");

let done = 0;
let nextIndex = 0;

async function compressOne(info, index) {
  const outFile = outputPathFor(info.file);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (fs.existsSync(outFile) && !force) {
    appendReport({ status: "skipped", input: info.file, output: outFile });
    const currentDone = ++done;
    console.log(`[${currentDone}/${selectedInfos.length}] skipped ${path.relative(inputRoot, info.file)}`);
    return;
  }

  const passlog = path.join(os.tmpdir(), `actrezz-${process.pid}-${index}`);
  const videoKbps = Math.max(140, targetTotalKbps - (info.hasAudio ? audioKbps : 0));
  const scaleArgs = [];
  if (info.height > maxHeight) {
    scaleArgs.push("-vf", `scale=${even((info.width * maxHeight) / info.height)}:${maxHeight}`);
  }

  const common = [
    "-y",
    "-i", info.file,
    "-map", "0:v:0",
    ...scaleArgs,
    "-c:v", "libx264",
    "-preset", preset,
    "-b:v", `${videoKbps}k`,
    "-pix_fmt", "yuv420p",
  ];

  try {
    console.log(`[${done + 1}/${selectedInfos.length}] worker ${index % workers + 1} compressing ${path.relative(inputRoot, info.file)}`);
    await run("ffmpeg", [
      ...common,
      "-pass", "1",
      "-passlogfile", passlog,
      "-an",
      "-f", "mp4",
      nullDevice,
    ], { stdio: "ignore" });

    await run("ffmpeg", [
      ...common,
      "-pass", "2",
      "-passlogfile", passlog,
      "-map", "0:a:0?",
      "-c:a", "aac",
      "-b:a", `${audioKbps}k`,
      "-ac", "1",
      "-movflags", "+faststart",
      outFile,
    ], { stdio: "ignore" });

    const outStat = fs.statSync(outFile);
    appendReport({
      status: "ok",
      input: info.file,
      output: outFile,
      durationSeconds: Math.round(info.duration),
      originalBytes: info.bytes,
      compressedBytes: outStat.size,
      originalHeight: info.height,
      targetVideoKbps: videoKbps,
      targetAudioKbps: info.hasAudio ? audioKbps : 0,
    });
  } catch (error) {
    appendReport({ status: "failed", input: info.file, output: outFile, error: error.message.slice(0, 2000) });
    console.error(`FAILED ${path.relative(inputRoot, info.file)}: ${error.message.split("\n")[0]}`);
  } finally {
    for (const suffix of ["-0.log", "-0.log.mbtree"]) {
      fs.rmSync(`${passlog}${suffix}`, { force: true });
    }
    const currentDone = ++done;
    console.log(`[${currentDone}/${selectedInfos.length}] finished ${path.relative(inputRoot, info.file)}`);
  }
}

async function worker(workerId) {
  while (nextIndex < selectedInfos.length) {
    const index = nextIndex++;
    await compressOne(selectedInfos[index], workerId);
  }
}

console.log(`Starting compression with ${workers} worker(s), ffmpeg preset "${preset}"`);
await Promise.all(Array.from({ length: workers }, (_, index) => worker(index)));

const outputs = walk(outputRoot).filter((file) => file.endsWith(".mp4"));
const totalOut = outputs.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`Done. Output size: ${(totalOut / 1024 ** 3).toFixed(2)} GiB at ${outputRoot}`);
console.log(`Report: ${reportPath}`);

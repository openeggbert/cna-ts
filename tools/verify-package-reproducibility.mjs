#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-reproducible-pack-"));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
  }
  return result.stdout.trim();
}

function npmCommand() {
  const configured = process.env.npm_execpath;
  if (configured?.endsWith(".js") && fs.existsSync(configured)) {
    return { command: process.execPath, prefix: [configured] };
  }
  const embedded = path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
  if (fs.existsSync(embedded)) return { command: process.execPath, prefix: [embedded] };
  return { command: "npm", prefix: [] };
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function pack(label) {
  const directory = path.join(temporary, label);
  fs.mkdirSync(directory);
  const npm = npmCommand();
  run(npm.command, [
    ...npm.prefix,
    "pack",
    "--ignore-scripts",
    "--pack-destination", directory,
    "--cache", path.join(temporary, "npm-cache"),
  ], ROOT);
  const packages = fs.readdirSync(directory).filter((value) => value.endsWith(".tgz"));
  if (packages.length !== 1) throw new Error(`pack ${label} produced ${packages.length} tarballs`);
  return path.join(directory, packages[0]);
}

try {
  const firstPath = pack("first");
  const secondPath = pack("second");
  const first = fs.readFileSync(firstPath);
  const second = fs.readFileSync(secondPath);
  const firstFiles = run("tar", ["-tzf", firstPath], ROOT).split("\n").filter(Boolean);
  const secondFiles = run("tar", ["-tzf", secondPath], ROOT).split("\n").filter(Boolean);
  const byteIdentical = first.equals(second);
  const tarPayloadIdentical = gunzipSync(first).equals(gunzipSync(second));
  const fileListIdentical = JSON.stringify(firstFiles) === JSON.stringify(secondFiles);

  console.log(`PACKAGE=${path.basename(firstPath)}`);
  console.log(`FIRST_SHA256=${sha256(first)}`);
  console.log(`SECOND_SHA256=${sha256(second)}`);
  console.log(`FILES=${firstFiles.length}`);
  console.log(`BYTES=${first.length}`);
  console.log(`BYTE_IDENTICAL=${byteIdentical ? "PASS" : "FAIL"}`);
  console.log(`TAR_PAYLOAD_IDENTICAL=${tarPayloadIdentical ? "PASS" : "FAIL"}`);
  console.log(`FILE_LIST_IDENTICAL=${fileListIdentical ? "PASS" : "FAIL"}`);
  if (!tarPayloadIdentical || !fileListIdentical) process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

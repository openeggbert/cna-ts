#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

function npmCommand() {
  const configured = process.env.npm_execpath;
  if (configured?.endsWith(".js") && fs.existsSync(configured)) {
    return { command: process.execPath, prefix: [configured] };
  }
  const embedded = path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
  if (fs.existsSync(embedded)) return { command: process.execPath, prefix: [embedded] };
  return { command: "npm", prefix: [] };
}

function build() {
  const npm = npmCommand();
  const result = spawnSync(npm.command, [...npm.prefix, "run", "build"], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
  if (result.status !== 0) {
    throw new Error(`clean build failed\n${result.stdout}${result.stderr}`);
  }
}

function files(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...files(file));
    else result.push(file);
  }
  return result;
}

function snapshot() {
  const entries = files(DIST).map((file) => ({
    name: path.relative(DIST, file).replaceAll(path.sep, "/"),
    bytes: fs.readFileSync(file),
  })).sort((left, right) => left.name.localeCompare(right.name));
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for (const entry of entries) {
    hash.update(entry.name);
    hash.update("\0");
    hash.update(entry.bytes);
    hash.update("\0");
    bytes += entry.bytes.length;
  }
  return { hash: hash.digest("hex"), files: entries.length, bytes };
}

build();
const first = snapshot();
build();
const second = snapshot();
console.log(`FIRST_DIST_SHA256=${first.hash}`);
console.log(`SECOND_DIST_SHA256=${second.hash}`);
console.log(`DIST_FILES=${second.files}`);
console.log(`DIST_BYTES=${second.bytes}`);
console.log(`DIST_BYTE_IDENTICAL=${first.hash === second.hash ? "PASS" : "FAIL"}`);
if (first.hash !== second.hash || first.files !== second.files || first.bytes !== second.bytes) {
  process.exitCode = 1;
}

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cnaRoot = path.resolve(process.env.CNA_SOURCE_PATH ?? path.join(root, "../../cnanext"));
const nodeInclude = process.env.NODE_INCLUDE
  ? path.resolve(process.env.NODE_INCLUDE)
  : path.resolve(path.dirname(process.execPath), "../include/node");
const output = path.resolve(process.env.CNA_NODE_BRIDGE ?? path.join(root, "build/cna_node_bridge.node"));
const source = path.join(root, "native/cna_node_bridge.c");
const cnaInclude = path.join(cnaRoot, "modules/c-api/include");

for (const [label, value] of [["CNA headers", cnaInclude], ["Node headers", nodeInclude]]) {
  if (!fs.statSync(value, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${label} not found: ${value}`);
  }
}
fs.mkdirSync(path.dirname(output), { recursive: true });

const compiler = process.env.CC ?? "cc";
const args = process.platform === "win32"
  ? ["/nologo", "/LD", "/std:c11", `/I${cnaInclude}`, `/I${nodeInclude}`, source, `/Fe:${output}`]
  : [
    "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-fPIC", "-shared",
    "-fvisibility=hidden", `-I${cnaInclude}`, `-I${nodeInclude}`, source, "-o", output,
    ...(process.platform === "darwin" ? [] : ["-ldl"]),
  ];
const result = spawnSync(compiler, args, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`CNA_NODE_BRIDGE=${output}`);

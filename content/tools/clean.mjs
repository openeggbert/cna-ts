#!/usr/bin/env node

/** Removes the build output so a rebuild cannot inherit a stale declaration. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });

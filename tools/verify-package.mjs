#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-package-"));

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status ?? "signal"})\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function npmCommand() {
  const configured = process.env.npm_execpath;
  if (configured?.endsWith(".js") && fs.existsSync(configured)) {
    return { command: process.execPath, prefix: [configured] };
  }
  const embedded = path.resolve(
    path.dirname(process.execPath),
    "../lib/node_modules/npm/bin/npm-cli.js",
  );
  if (fs.existsSync(embedded)) return { command: process.execPath, prefix: [embedded] };
  return { command: "npm", prefix: [] };
}

function runNpm(args, cwd) {
  const npm = npmCommand();
  return run(npm.command, [...npm.prefix, ...args], cwd);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function installTarball(directory, tarball) {
  runNpm(
    [
      "install",
      tarball,
      "--no-save",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      path.join(temporary, "npm-cache"),
    ],
    directory,
  );
}

try {
  runNpm(
    [
      "pack",
      "--ignore-scripts",
      "--pack-destination",
      temporary,
      "--cache",
      path.join(temporary, "npm-cache"),
    ],
    ROOT,
  );
  const packages = fs.readdirSync(temporary).filter((value) => value.endsWith(".tgz"));
  if (packages.length !== 1) throw new Error(`npm pack produced ${packages.length} tarballs`);
  const packageName = packages[0];
  const tarball = path.join(temporary, packageName);

  const javascript = path.join(temporary, "javascript-consumer");
  fs.mkdirSync(javascript);
  writeJson(path.join(javascript, "package.json"), {
    private: true,
    type: "module",
    dependencies: { "cna-ts": "0.1.0" },
  });
  fs.writeFileSync(
    path.join(javascript, "main.mjs"),
    `import assert from "node:assert/strict";\n` +
      `import { Color, GetRuntimeStatus, Microsoft, Vector2 } from "cna-ts";\n` +
      `import { Vector3 } from "cna-ts/xna";\n` +
      `import { GetRendererInfo } from "cna-ts/extensions";\n` +
      `import { NativeUnavailableError } from "cna-ts/runtime";\n` +
      `assert.equal(Vector2.Add(new Vector2(1, 2), new Vector2(3, 4)).X, 4);\n` +
      `assert.equal(new Vector3(1).Z, 1);\n` +
      `assert.equal(Color.CornflowerBlue.B, 237);\n` +
      `assert.equal(Microsoft.Xna.Framework.Vector2, Vector2);\n` +
      `assert.equal(GetRuntimeStatus().IsAvailable, false);\n` +
      `assert.throws(() => GetRendererInfo(), NativeUnavailableError);\n` +
      `await assert.rejects(import("cna-ts/internal/backend"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });\n`,
  );
  installTarball(javascript, tarball);
  run(process.execPath, ["main.mjs"], javascript);

  const typescript = path.join(temporary, "typescript-consumer");
  fs.mkdirSync(typescript);
  writeJson(path.join(typescript, "package.json"), {
    private: true,
    type: "module",
    dependencies: { "cna-ts": "0.1.0" },
  });
  writeJson(path.join(typescript, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ["main.ts"],
  });
  fs.writeFileSync(
    path.join(typescript, "main.ts"),
    `import { Color, Microsoft, Vector2 } from "cna-ts";\n` +
      `import { Matrix, Vector3 } from "cna-ts/xna";\n` +
      `import type { RendererInfo } from "cna-ts/extensions";\n` +
      `import type { RuntimeStatus } from "cna-ts/runtime";\n` +
      `const vector: Vector2 = Vector2.Transform(Vector2.One, Matrix.Identity);\n` +
      `const color: Color = Microsoft.Xna.Framework.Color.White;\n` +
      `const vector3: Vector3 = Vector3.Cross(Vector3.UnitX, Vector3.UnitY);\n` +
      `const status: RuntimeStatus | undefined = undefined;\n` +
      `const renderer: RendererInfo | undefined = undefined;\n` +
      `void [vector, color, vector3, status, renderer];\n`,
  );
  installTarball(typescript, tarball);
  run(
    process.execPath,
    [path.join(ROOT, "node_modules/typescript/bin/tsc"), "-p", path.join(typescript, "tsconfig.json")],
    ROOT,
  );

  console.log(`PACKED_ARTIFACT=${path.basename(tarball)}`);
  console.log("JAVASCRIPT_CONSUMER=PASS");
  console.log("TYPESCRIPT_CONSUMER=PASS");
  console.log("INTERNAL_EXPORT_BLOCK=PASS");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readDeclarationModel } from "./lib/declarations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(values) {
  const result = {
    declarations: path.join(ROOT, "dist/Microsoft/Xna/Framework"),
    module: path.join(ROOT, "dist/index.js"),
    format: "text",
    output: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--declarations") result.declarations = path.resolve(values[++index]);
    else if (value === "--module") result.module = path.resolve(values[++index]);
    else if (value === "--format") result.format = values[++index];
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else throw new Error(`unknown argument: ${value}`);
  }
  return result;
}

function diagnostic(code, subject, expected, actual) {
  const value = { code, subject };
  if (expected !== undefined) value.expected = expected;
  if (actual !== undefined) value.actual = actual;
  return value;
}

function resolveRuntimeType(Microsoft, fullName) {
  const parts = fullName.split(".");
  let value = Microsoft;
  for (const part of parts.slice(1)) value = value?.[part];
  return value;
}

function hasOwnOrInherited(value, name) {
  let current = value;
  while (current) {
    if (Object.getOwnPropertyDescriptor(current, name)) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function runtimeMemberName(name) {
  return name === "[Symbol.iterator]" ? Symbol.iterator : name;
}

function verifyType(type, runtime, rootModule, diagnostics) {
  if (type.kind === "interface" || type.kind === "delegate") return;
  if (runtime == null) {
    diagnostics.push(diagnostic("RUNTIME_MISSING_TYPE", type.name, type.kind));
    return;
  }
  if (type.kind === "class") {
    if (typeof runtime !== "function") {
      diagnostics.push(diagnostic("RUNTIME_TYPE_MISMATCH", type.name, "function", typeof runtime));
      return;
    }
    const shortName = type.name.slice(type.name.lastIndexOf(".") + 1);
    if (type.name.split(".").length === 4 && rootModule[shortName] !== runtime) {
      diagnostics.push(diagnostic("RUNTIME_ALIAS_MISMATCH", type.name, "same root export"));
    }
  }
  for (const member of type.members) {
    if (member.kind === "constructor") continue;
    if (type.kind === "enum") {
      const actual = runtime[member.name];
      if (actual === undefined) {
        diagnostics.push(diagnostic("RUNTIME_MISSING_ENUM", `${type.name}.${member.name}`, member.constant));
      } else if (member.constant != null && String(actual) !== member.constant) {
        diagnostics.push(
          diagnostic("RUNTIME_ENUM_VALUE_MISMATCH", `${type.name}.${member.name}`, member.constant, actual),
        );
      }
      continue;
    }
    const owner = member.static ? runtime : runtime.prototype;
    if (member.kind === "field") {
      if (member.static && !hasOwnOrInherited(owner, member.name)) {
        diagnostics.push(diagnostic("RUNTIME_MISSING_STATIC", `${type.name}.${member.name}`));
      }
      continue;
    }
    if (member.kind === "method") {
      if (member.abstract) continue;
      if (typeof owner?.[runtimeMemberName(member.name)] !== "function") {
        diagnostics.push(diagnostic("RUNTIME_MISSING_METHOD", `${type.name}.${member.name}`));
      }
      continue;
    }
    if (member.kind === "property") {
      let current = owner;
      let descriptor;
      while (current && !descriptor) {
        descriptor = Object.getOwnPropertyDescriptor(current, runtimeMemberName(member.name));
        current = Object.getPrototypeOf(current);
      }
      if (!descriptor) {
        const needsConcreteGetter = member.getterAccess !== "none" && !member.getterAbstract;
        const needsConcreteSetter = member.setterAccess !== "none" && !member.setterAbstract;
        if (needsConcreteGetter || needsConcreteSetter) {
          diagnostics.push(diagnostic("RUNTIME_MISSING_ACCESSOR", `${type.name}.${member.name}`));
        }
      } else {
        if (
          member.getterAccess !== "none" &&
          !member.getterAbstract &&
          typeof descriptor.get !== "function"
        ) {
          diagnostics.push(diagnostic("RUNTIME_MISSING_GETTER", `${type.name}.${member.name}`));
        }
        if (
          member.setterAccess !== "none" &&
          !member.setterAbstract &&
          typeof descriptor.set !== "function"
        ) {
          diagnostics.push(diagnostic("RUNTIME_MISSING_SETTER", `${type.name}.${member.name}`));
        }
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = readDeclarationModel(args.declarations);
  const rootModule = await import(pathToFileURL(args.module).href);
  const diagnostics = [];
  if (!rootModule.Microsoft?.Xna?.Framework) {
    diagnostics.push(diagnostic("RUNTIME_MISSING_NAMESPACE", "Microsoft.Xna.Framework"));
  } else {
    for (const type of target.types) {
      verifyType(type, resolveRuntimeType(rootModule.Microsoft, type.name), rootModule, diagnostics);
    }
  }
  diagnostics.sort((left, right) => `${left.code}:${left.subject}`.localeCompare(`${right.code}:${right.subject}`));
  const report = {
    targetTypes: target.types.length,
    runtimeDifferences: diagnostics.length,
    diagnostics,
  };
  const output = args.format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : `TARGET_TYPES=${report.targetTypes}\nRUNTIME_DIFFERENCES=${report.runtimeDifferences}\n${diagnostics.map((item) => `${item.code} ${item.subject}`).join("\n")}${diagnostics.length ? "\n" : ""}`;
  if (args.output) fs.writeFileSync(args.output, output);
  else process.stdout.write(output);
  if (diagnostics.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});

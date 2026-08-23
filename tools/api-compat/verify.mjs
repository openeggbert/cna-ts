#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { memberSignature, readDeclarationModel } from "./lib/declarations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_PROFILE = path.join(ROOT, "tools/api-compat/profiles/xna40-windows-runtime.json");
const DEFAULT_RULES = path.join(ROOT, "tools/api-compat/mapping-rules.json");
const DIAGNOSTIC_CODES = [
  "MISSING_TYPE",
  "UNEXPECTED_TYPE",
  "BASE_MISMATCH",
  "INTERFACE_MISMATCH",
  "MISSING_MEMBER",
  "UNEXPECTED_MEMBER",
  "PROPERTY_MISMATCH",
  "PARAMETER_MISMATCH",
  "RETURN_TYPE_MISMATCH",
  "OVERLOAD_MISMATCH",
  "GENERIC_MISMATCH",
  "ENUM_VALUE_MISMATCH",
  "EVENT_MAPPING_MISMATCH",
  "OPERATOR_MAPPING_MISMATCH",
  "LANGUAGE_MAPPING_MISMATCH",
  "INTERNAL_LEAK",
];

function parseArgs(values) {
  const result = {
    referenceDir: process.env.XNA_REFERENCE_PATH,
    declarations: path.join(ROOT, "dist/Microsoft/Xna/Framework"),
    profile: DEFAULT_PROFILE,
    rules: DEFAULT_RULES,
    format: "text",
    output: null,
    expectedOutput: null,
    reportOnly: false,
    summaryOnly: false,
    leakOnly: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--reference-dir") result.referenceDir = values[++index];
    else if (value === "--declarations") result.declarations = path.resolve(values[++index]);
    else if (value === "--profile") result.profile = path.resolve(values[++index]);
    else if (value === "--mapping-rules") result.rules = path.resolve(values[++index]);
    else if (value === "--format") result.format = values[++index];
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else if (value === "--expected-output") result.expectedOutput = path.resolve(values[++index]);
    else if (value === "--report-only") result.reportOnly = true;
    else if (value === "--summary-only") result.summaryOnly = true;
    else if (value === "--leak-only") result.leakOnly = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!new Set(["text", "json"]).has(result.format)) {
    throw new Error("--format must be text or json");
  }
  return result;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status ?? "signal"})\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

function fileSha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readReference(referenceDir, profile, temporary) {
  if (!referenceDir) {
    throw new Error("set XNA_REFERENCE_PATH or pass --reference-dir");
  }
  for (const assembly of profile.referenceAssemblies) {
    const file = path.join(referenceDir, assembly);
    if (!fs.existsSync(file)) throw new Error(`missing XNA reference assembly: ${file}`);
    const expected = profile.referenceSha256[assembly];
    const actual = fileSha256(file);
    if (expected !== actual) {
      throw new Error(`reference SHA-256 mismatch for ${assembly}: expected ${expected}, got ${actual}`);
    }
  }
  const executable = path.join(temporary, "XnaContractExtractor.exe");
  const output = path.join(temporary, "reference.json");
  run("mcs", [
    "-warnaserror+",
    "-r:System.Core",
    "-r:System.Web.Extensions",
    `-out:${executable}`,
    path.join(ROOT, "tools/api-compat/extractor/XnaContractExtractor.cs"),
  ]);
  run("mono", [executable, referenceDir, output, ...profile.referenceAssemblies]);
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

function stripArity(value) {
  return value.replace(/`\d+/g, "").replaceAll("+", ".");
}

function splitGeneric(value) {
  const first = value.indexOf("[");
  if (first < 0 || !value.endsWith("]")) return null;
  const body = value.slice(first + 1, -1);
  const argumentsList = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "[") depth += 1;
    else if (body[index] === "]") depth -= 1;
    else if (body[index] === "," && depth === 0) {
      argumentsList.push(body.slice(start, index));
      start = index + 1;
    }
  }
  argumentsList.push(body.slice(start));
  return { base: value.slice(0, first), argumentsList };
}

function mapType(value, rules, genericNames = []) {
  if (value == null) return null;
  if (value.endsWith("&")) return mapType(value.slice(0, -1), rules, genericNames);
  if (value.endsWith("[]")) return `${mapType(value.slice(0, -2), rules, genericNames)}[]`;
  if (value.startsWith("!")) return genericNames[Number(value.slice(1))] ?? `T${value.slice(1)}`;
  if (rules.frameworkTypeMappings[value]) return rules.frameworkTypeMappings[value];
  const generic = splitGeneric(value);
  if (generic) {
    const collectionMappings = {
      "System.Collections.Generic.IEnumerable`1": "Iterable",
      "System.Collections.Generic.ICollection`1": "Array",
      "System.Collections.Generic.IList`1": "Array",
      "System.Collections.Generic.List`1": "Array",
      "System.Collections.Generic.Dictionary`2": "Map",
      "System.Collections.ObjectModel.ReadOnlyCollection`1": "ReadonlyArray",
      "System.Collections.Generic.IEnumerator`1": "IterableIterator",
      "System.Nullable`1": "Nullable",
      "System.EventHandler`1": "XnaEventHandler",
      "System.IEquatable`1": "Microsoft.Xna.Framework.IEquatable",
      "System.IComparable`1": "Microsoft.Xna.Framework.IComparable",
    };
    const mappedBase =
      collectionMappings[generic.base] ?? rules.genericTypeRenames[generic.base] ?? stripArity(generic.base);
    const argumentsText = generic.argumentsList.map((argument) => mapType(argument, rules, genericNames));
    if (mappedBase === "Nullable") return [argumentsText[0], "null"].sort().join("|");
    return `${mappedBase}<${argumentsText.join(",")}>`;
  }
  if (value === "System.IDisposable") return "Microsoft.Xna.Framework.IDisposable";
  if (value.startsWith("System.")) return stripArity(value).slice("System.".length);
  return rules.genericTypeRenames[value] ?? stripArity(value);
}

function mapTypeIdentity(value, rules) {
  return rules.genericTypeRenames[value] ?? stripArity(value);
}

function diagnostic(code, subject, expected, actual) {
  const value = { code, subject };
  if (expected !== undefined) value.expected = expected;
  if (actual !== undefined) value.actual = actual;
  return value;
}

function memberKey(member) {
  if (member.kind === "method" || member.kind === "constructor") {
    return `${member.kind}:${member.static ? "static:" : ""}${member.name}`;
  }
  return `${member.kind}:${member.static ? "static:" : ""}${member.name}`;
}

function mappedParameters(values, rules, genericNames) {
  return values.map((value) => ({
    name: value.name,
    type: mapType(value.type, rules, genericNames),
    optional: value.optional,
    rest: false,
  }));
}

function mapCallable(member, rules, genericNames) {
  const methodGenericNames = member.genericParameters?.map((parameter) => parameter.name) ?? [];
  const names = methodGenericNames.length > 0 ? methodGenericNames : genericNames;
  let returnType = mapType(member.returnType, rules, names);
  if (member.name === "Run" && returnType === "void") returnType = rules.gameRun;
  return {
    kind: member.kind,
    name: member.name,
    access: member.access,
    static: member.static,
    abstract: member.abstract,
    genericArity: member.genericArity,
    genericParameters: member.genericParameters ?? [],
    returnType,
    parameters: mappedParameters(member.parameters, rules, names),
  };
}

function transformReference(reference, rules) {
  const mappingDiagnostics = [];
  const types = [];
  for (const sourceType of reference.types) {
    const genericNames = sourceType.genericParameters?.map((parameter) => parameter.name) ?? [];
    const ordinaryMethods = sourceType.members.filter(
      (member) => member.kind === "method" && !member.parameters.some((parameter) => parameter.type.endsWith("&")),
    );
    const members = [];
    for (const member of sourceType.members) {
      const constructorIdentity = member.kind === "constructor"
        ? `${stripArity(sourceType.name)}.${member.name}(${member.parameters.map((value) => value.type).join(",")})`
        : null;
      if (constructorIdentity && (rules.ignoredConstructors ?? []).includes(constructorIdentity)) {
        continue;
      }
      if (member.kind === "method" && (rules.ignoredMethods ?? []).includes(member.name)) {
        continue;
      }
      if (sourceType.kind === "enum" && member.kind === "field" && member.name === "value__") {
        continue;
      }
      if (
        member.kind === "method" &&
        member.access === "protected" &&
        rules.mixedVisibilityOverloads.includes(`${stripArity(sourceType.name)}.${member.name}`)
      ) {
        continue;
      }
      if (member.kind === "method" && rules.operatorMethods[member.name]) {
        const mappedName = rules.operatorMethods[member.name];
        if (!ordinaryMethods.some((candidate) => candidate.name === mappedName)) {
          mappingDiagnostics.push(
            diagnostic("OPERATOR_MAPPING_MISMATCH", `${sourceType.name}.${member.name}`, mappedName),
          );
        }
        continue;
      }
      if (
        (member.kind === "method" || member.kind === "constructor") &&
        member.parameters.some((parameter) => parameter.type.endsWith("&"))
      ) {
        const refRule = rules.refOutMethods[`${stripArity(sourceType.name)}.${member.name}`];
        if (refRule) {
          const mapped = mapCallable(member, rules, genericNames);
          mapped.returnType = refRule.returnType;
          mapped.parameters = mapped.parameters.filter(
            (_parameter, index) => !member.parameters[index].type.endsWith("&"),
          );
          members.push(mapped);
        } else if (!member.parameters.some((parameter) => parameter.out)) {
          // A CLR ref input has ordinary value semantics at the TypeScript boundary. Keep the
          // overload; unique-member normalization below removes it only when it is truly the
          // same signature as an existing value overload.
          members.push(mapCallable(member, rules, genericNames));
        } else {
          const mappedInputs = member.parameters
            .filter((parameter) => !parameter.out)
            .map((parameter) => mapType(parameter.type, rules, genericNames));
          const mappedOutputs = member.parameters
            .filter((parameter) => parameter.out)
            .map((parameter) => mapType(parameter.type, rules, genericNames));
          const hasEquivalentReturnOverload = mappedOutputs.length === 1 && ordinaryMethods.some((candidate) =>
            candidate.name === member.name &&
            mapType(candidate.returnType, rules, genericNames) === mappedOutputs[0] &&
            JSON.stringify(candidate.parameters.map((parameter) => mapType(parameter.type, rules, genericNames))) ===
              JSON.stringify(mappedInputs),
          );
          if (!hasEquivalentReturnOverload) {
          mappingDiagnostics.push(
            diagnostic(
              "LANGUAGE_MAPPING_MISMATCH",
              `${sourceType.name}.${member.name}`,
              rules.refOut.otherwise,
              member.parameters.map((parameter) => parameter.type),
            ),
          );
          }
        }
        continue;
      }
      if (
        rules.contentLoad &&
        stripArity(sourceType.name) === "Microsoft.Xna.Framework.Content.ContentManager" &&
        member.kind === "method" &&
        member.name === "Load" &&
        member.genericArity === 1
      ) {
        const mapped = mapCallable(member, rules, genericNames);
        const genericName = member.genericParameters?.[0]?.name ?? "T";
        mapped.parameters.unshift({
          name: "assetType",
          type: `Microsoft.Xna.Framework.XnaType<${genericName}>`,
          optional: false,
          rest: false,
        });
        members.push(mapped);
        continue;
      }
      if (member.kind === "method" || member.kind === "constructor") {
        members.push(mapCallable(member, rules, genericNames));
      } else if (member.kind === "property" && member.parameters.length > 0) {
        const indexes = mappedParameters(member.parameters, rules, genericNames);
        const type = mapType(member.type, rules, genericNames);
        if (member.getterAccess !== "none") {
          members.push({
            kind: "method",
            name: "Get",
            access: member.getterAccess,
            static: member.static,
            abstract: sourceType.kind === "interface",
            genericArity: 0,
            genericParameters: [],
            returnType: type,
            parameters: indexes,
          });
        }
        if (member.setterAccess !== "none") {
          members.push({
            kind: "method",
            name: "Set",
            access: member.setterAccess,
            static: member.static,
            abstract: sourceType.kind === "interface",
            genericArity: 0,
            genericParameters: [],
            returnType: "void",
            parameters: [...indexes, { name: "value", type, optional: false, rest: false }],
          });
        }
      } else if (member.kind === "property") {
        members.push({
          ...member,
          type: mapType(member.type, rules, genericNames),
          setterAccess:
            member.getterAccess === "public" && member.setterAccess === "protected"
              ? "none"
              : member.setterAccess,
          parameters: [],
        });
      } else if (member.kind === "field") {
        members.push({ ...member, type: mapType(member.type, rules, genericNames) });
      } else if (member.kind === "event") {
        const eventDelegate = splitGeneric(member.type);
        const eventArgs = eventDelegate?.base === "System.EventHandler`1"
          ? mapType(eventDelegate.argumentsList[0], rules, genericNames)
          : mapType(member.type, rules, genericNames);
        members.push({
          kind: "field",
          name: member.name,
          access: member.addAccess,
          type: `Microsoft.Xna.Framework.XnaEvent<unknown,${eventArgs}>`,
          static: member.static,
          final: true,
          constant: null,
        });
      }
    }
    const genericBase = splitGeneric(sourceType.baseType ?? "");
    if (genericBase?.base === "System.Collections.ObjectModel.Collection`1") {
      const itemType = mapType(genericBase.argumentsList[0], rules, genericNames);
      const parameter = (name, type) => ({ name, type, optional: false, rest: false });
      const method = (name, returnType, parameters) => ({
        kind: "method",
        name,
        access: "public",
        static: false,
        abstract: false,
        genericArity: 0,
        genericParameters: [],
        returnType,
        parameters,
      });
      members.push(
        {
          kind: "property",
          name: "Count",
          type: "number",
          static: false,
          getterAccess: "public",
          setterAccess: "none",
          parameters: [],
        },
        method("Get", itemType, [parameter("index", "number")]),
        method("Set", "void", [parameter("index", "number"), parameter("value", itemType)]),
        method("Add", "void", [parameter("item", itemType)]),
        method("Clear", "void", []),
        method("Contains", "boolean", [parameter("item", itemType)]),
        method("CopyTo", "void", [parameter("array", `${itemType}[]`), parameter("arrayIndex", "number")]),
        method("GetEnumerator", `IterableIterator<${itemType}>`, []),
        method("IndexOf", "number", [parameter("item", itemType)]),
        method("Insert", "void", [parameter("index", "number"), parameter("item", itemType)]),
        method("Remove", "boolean", [parameter("item", itemType)]),
        method("RemoveAt", "void", [parameter("index", "number")]),
      );
    }
    const uniqueMembers = new Map();
    for (const member of members) {
      const key = `${memberKey(member)}:${memberSignature(member)}`;
      if (!uniqueMembers.has(key)) uniqueMembers.set(key, member);
    }
    const ignoredBases = new Set(["System.Object", "System.ValueType", "System.Enum", "System.MulticastDelegate"]);
    types.push({
      name: mapTypeIdentity(sourceType.name, rules),
      kind: sourceType.kind === "struct" ? "class" : sourceType.kind,
      access: sourceType.access,
      abstract: sourceType.abstract,
      sealed: sourceType.sealed,
      genericArity: sourceType.genericArity,
      genericParameters: sourceType.genericParameters ?? [],
      baseType:
        ignoredBases.has(sourceType.baseType) ||
        (rules.erasedBaseTypes ?? []).some(
          (identity) => sourceType.baseType === identity || sourceType.baseType?.startsWith(`${identity}[`),
        )
          ? null
          : mapType(sourceType.baseType, rules, genericNames),
      interfaces: sourceType.interfaces
        .filter((value) => !(rules.erasedInterfaces ?? []).some(
          (identity) => value === identity || value.startsWith(`${identity}[`),
        ))
        .map((value) => mapType(value, rules, genericNames))
        .sort(),
      members: [...uniqueMembers.values()],
    });
  }
  for (const synthetic of rules.syntheticTypes) {
    const syntheticMembers = synthetic.name === "Microsoft.Xna.Framework.IDisposable"
      ? [{
        kind: "method",
        name: "Dispose",
        access: "public",
        static: false,
        abstract: true,
        genericArity: 0,
        genericParameters: [],
        returnType: "void",
        parameters: [],
      }]
      : null;
    types.push({
      name: synthetic.name,
      kind: synthetic.kind,
      access: "public",
      abstract: false,
      sealed: false,
      genericArity: synthetic.genericArity ?? 0,
      genericParameters: [],
      baseType: null,
      interfaces: [],
      members: syntheticMembers,
      synthetic: true,
    });
  }
  // CLR permits explicit interface implementations that are not public class
  // members. TypeScript uses structural interfaces, so projected classes must
  // expose the inherited interface contract as ordinary public members.
  const byName = new Map(types.map((value) => [value.name, value]));
  // TypeScript overrides replace an overload set rather than adding to it. When a CLR subtype
  // adds overloads under a base method's name, repeat the inherited signatures so the derived
  // declaration remains assignable to its declared base while preserving every callable shape.
  for (const type of types) {
    if (type.kind !== "class" || type.members == null || !type.baseType) continue;
    const base = byName.get(type.baseType.replace(/<.*>$/, ""));
    if (!base?.members) continue;
    const overriddenNames = new Set(
      type.members.filter((member) => member.kind === "method").map((member) => member.name),
    );
    const signatures = new Set(type.members.map((member) => `${memberKey(member)}:${memberSignature(member)}`));
    for (const member of base.members) {
      if (member.kind !== "method" || !overriddenNames.has(member.name)) continue;
      const key = `${memberKey(member)}:${memberSignature(member)}`;
      if (!signatures.has(key)) {
        type.members.push({ ...member, access: "public", abstract: false });
        signatures.add(key);
      }
    }
  }
  const interfaceMembers = (name, visited = new Set()) => {
    const identity = name.replace(/<.*>$/, "");
    if (visited.has(identity)) return [];
    visited.add(identity);
    const contract = byName.get(identity);
    if (!contract || contract.kind !== "interface") return [];
    return [
      ...(contract.members ?? []),
      ...contract.interfaces.flatMap((value) => interfaceMembers(value, visited)),
    ];
  };
  for (const type of types) {
    if (type.kind !== "class" || type.members == null) continue;
    const structural = type.interfaces.flatMap((value) => interfaceMembers(value));
    const keys = new Set(type.members.map(memberKey));
    for (const member of structural) {
      const projected = { ...member, access: "public", abstract: false };
      const key = memberKey(projected);
      if (!keys.has(key)) {
        type.members.push(projected);
        keys.add(key);
      }
    }
  }
  types.sort((left, right) => left.name.localeCompare(right.name));
  return { types, mappingDiagnostics };
}

function groupMembers(values) {
  const result = new Map();
  for (const value of values) {
    const key = memberKey(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

function compareCallables(typeName, key, expected, actual, diagnostics) {
  const sort = (values) => [...values].sort((left, right) => memberSignature(left).localeCompare(memberSignature(right)));
  const expectedSorted = sort(expected);
  const actualSorted = sort(actual);
  if (expectedSorted.length !== actualSorted.length) {
    diagnostics.push(
      diagnostic(
        "OVERLOAD_MISMATCH",
        `${typeName}.${key}`,
        expectedSorted.map(memberSignature),
        actualSorted.map(memberSignature),
      ),
    );
    return;
  }
  for (let index = 0; index < expectedSorted.length; index += 1) {
    const expectedMember = expectedSorted[index];
    const actualMember = actualSorted[index];
    const expectedParameters = expectedMember.parameters.map((value) => ({
      name: value.name,
      type: value.type,
      optional: value.optional,
      rest: value.rest,
    }));
    const actualParameters = actualMember.parameters.map((value) => ({
      name: value.name,
      type: value.type,
      optional: value.optional,
      rest: value.rest,
    }));
    if (JSON.stringify(expectedParameters) !== JSON.stringify(actualParameters)) {
      diagnostics.push(
        diagnostic("PARAMETER_MISMATCH", `${typeName}.${key}#${index + 1}`, expectedParameters, actualParameters),
      );
    }
    if (expectedMember.returnType !== actualMember.returnType) {
      diagnostics.push(
        diagnostic(
          "RETURN_TYPE_MISMATCH",
          `${typeName}.${key}#${index + 1}`,
          expectedMember.returnType,
          actualMember.returnType,
        ),
      );
    }
    if (expectedMember.genericArity !== actualMember.genericArity) {
      diagnostics.push(
        diagnostic(
          "GENERIC_MISMATCH",
          `${typeName}.${key}#${index + 1}`,
          expectedMember.genericArity,
          actualMember.genericArity,
        ),
      );
    }
    if (expectedMember.access !== actualMember.access) {
      diagnostics.push(
        diagnostic(
          "LANGUAGE_MAPPING_MISMATCH",
          `${typeName}.${key}#${index + 1}.access`,
          expectedMember.access,
          actualMember.access,
        ),
      );
    }
  }
}

function compareMember(typeName, typeKind, key, expected, actual, diagnostics) {
  const left = expected[0];
  const right = actual[0];
  if (left.kind === "event" || right.kind === "event") {
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      diagnostics.push(diagnostic("EVENT_MAPPING_MISMATCH", `${typeName}.${key}`, left, right));
    }
    return;
  }
  if (left.kind === "property" || right.kind === "property") {
    const expectedProperty = {
      type: left.type,
      static: left.static,
      getterAccess: left.getterAccess,
      setterAccess: left.setterAccess,
    };
    const actualProperty = {
      type: right.type,
      static: right.static,
      getterAccess: right.getterAccess,
      setterAccess: right.setterAccess,
    };
    if (JSON.stringify(expectedProperty) !== JSON.stringify(actualProperty)) {
      diagnostics.push(
        diagnostic("PROPERTY_MISMATCH", `${typeName}.${key}`, expectedProperty, actualProperty),
      );
    }
    return;
  }
  if (left.type !== right.type || left.final !== right.final) {
    diagnostics.push(
      diagnostic(
        "PROPERTY_MISMATCH",
        `${typeName}.${key}`,
        { type: left.type, readonly: left.final },
        { type: right.type, readonly: right.final },
      ),
    );
  }
  if (typeKind === "enum" && left.constant !== right.constant && left.constant != null) {
    diagnostics.push(
      diagnostic("ENUM_VALUE_MISMATCH", `${typeName}.${key}`, left.constant, right.constant),
    );
  }
}

function compareTypes(expectedModel, targetModel, initialDiagnostics, rules) {
  const diagnostics = [...initialDiagnostics];
  const expected = new Map(expectedModel.types.map((value) => [value.name, value]));
  const actual = new Map(targetModel.types.map((value) => [value.name, value]));
  for (const [name, expectedType] of expected) {
    const actualType = actual.get(name);
    if (!actualType) {
      diagnostics.push(diagnostic("MISSING_TYPE", name, expectedType.kind));
      continue;
    }
    if (expectedType.kind !== actualType.kind) {
      diagnostics.push(diagnostic("LANGUAGE_MAPPING_MISMATCH", `${name}.kind`, expectedType.kind, actualType.kind));
    }
    if (expectedType.baseType !== actualType.baseType) {
      diagnostics.push(diagnostic("BASE_MISMATCH", name, expectedType.baseType, actualType.baseType));
    }
    if (JSON.stringify(expectedType.interfaces) !== JSON.stringify(actualType.interfaces)) {
      diagnostics.push(diagnostic("INTERFACE_MISMATCH", name, expectedType.interfaces, actualType.interfaces));
    }
    if (expectedType.genericArity !== actualType.genericArity) {
      diagnostics.push(
        diagnostic("GENERIC_MISMATCH", `${name}.genericArity`, expectedType.genericArity, actualType.genericArity),
      );
    }
    if (expectedType.members == null) continue;
    const expectedMembers = groupMembers(expectedType.members);
    const actualMembers = groupMembers(actualType.members);
    const pairedKeys = new Set();
    for (const [key, expectedGroup] of expectedMembers) {
      let actualGroup = actualMembers.get(key);
      if (!actualGroup && !key.startsWith("method:") && !key.startsWith("constructor:")) {
        const namePart = key.slice(key.lastIndexOf(":") + 1);
        const alternative = [...actualMembers.entries()].find(([candidate]) => candidate.endsWith(`:${namePart}`));
        if (alternative) {
          actualGroup = alternative[1];
          pairedKeys.add(alternative[0]);
        }
      }
      if (!actualGroup) {
        diagnostics.push(
          diagnostic("MISSING_MEMBER", `${name}.${key}`, expectedGroup.map(memberSignature)),
        );
        continue;
      }
      pairedKeys.add(key);
      if (key.startsWith("method:") || key.startsWith("constructor:")) {
        compareCallables(name, key, expectedGroup, actualGroup, diagnostics);
      } else {
        compareMember(name, expectedType.kind, key, expectedGroup, actualGroup, diagnostics);
      }
    }
    for (const [key, actualGroup] of actualMembers) {
      const iterableProtocolKey = `method:${rules.iterableProtocolMember}`;
      if (
        key === iterableProtocolKey &&
        expectedType.interfaces.some((value) => value.startsWith("Iterable<"))
      ) {
        continue;
      }
      if (!expectedMembers.has(key) && !pairedKeys.has(key)) {
        diagnostics.push(
          diagnostic("UNEXPECTED_MEMBER", `${name}.${key}`, undefined, actualGroup.map(memberSignature)),
        );
      }
    }
  }
  for (const [name, actualType] of actual) {
    if (!expected.has(name)) diagnostics.push(diagnostic("UNEXPECTED_TYPE", name, undefined, actualType.kind));
  }
  diagnostics.sort((left, right) => `${left.code}:${left.subject}`.localeCompare(`${right.code}:${right.subject}`));
  return diagnostics;
}

function leakDiagnostics(targetModel) {
  const banned = /(?:^|[.<])(internal|backend|native|pointer|memory|napi|webassembly|wasm)(?:[.>]|$)/i;
  const diagnostics = [];
  for (const type of targetModel.types) {
    const relationships = [type.baseType, ...type.interfaces].filter(Boolean);
    for (const relationship of relationships) {
      if (banned.test(relationship)) diagnostics.push(diagnostic("INTERNAL_LEAK", type.name, undefined, relationship));
    }
    for (const member of type.members) {
      const values = [member.type, member.returnType, ...(member.parameters ?? []).map((value) => value.type)].filter(Boolean);
      const suspiciousName = /(?:native|pointer|memory|backend)/i.test(member.name);
      const rawHandle = /handle/i.test(member.name) && values.includes("number");
      const leaked = values.find((value) => banned.test(value));
      if (suspiciousName || rawHandle || leaked) {
        diagnostics.push(
          diagnostic("INTERNAL_LEAK", `${type.name}.${member.name}`, undefined, leaked ?? member.name),
        );
      }
    }
  }
  return diagnostics;
}

function summary(reference, expected, target, diagnostics, rules) {
  const diagnosticCounts = Object.fromEntries(DIAGNOSTIC_CODES.map((code) => [code, 0]));
  for (const item of diagnostics) diagnosticCounts[item.code] = (diagnosticCounts[item.code] ?? 0) + 1;
  return {
    profile: reference?.profile ?? "reference-independent leak guard",
    referenceTypes: reference?.types.length ?? null,
    referenceMembers: reference?.types.reduce((total, type) => total + type.members.length, 0) ?? null,
    expectedMappedTypes: expected?.types.length ?? null,
    targetTypes: target.types.length,
    totalDifferences: diagnostics.length,
    allowlistSize: rules.allowlist.length,
    diagnosticCounts,
  };
}

function textReport(report, summaryOnly) {
  const lines = [
    `PROFILE=${report.summary.profile}`,
    `REFERENCE_TYPES=${report.summary.referenceTypes ?? "N/A"}`,
    `REFERENCE_MEMBERS=${report.summary.referenceMembers ?? "N/A"}`,
    `EXPECTED_MAPPED_TYPES=${report.summary.expectedMappedTypes ?? "N/A"}`,
    `TARGET_TYPES=${report.summary.targetTypes}`,
    `TOTAL_DIFFERENCES=${report.summary.totalDifferences}`,
    `ALLOWLIST_SIZE=${report.summary.allowlistSize}`,
    ...Object.entries(report.summary.diagnosticCounts).map(([code, count]) => `${code}=${count}`),
  ];
  if (!summaryOnly) {
    for (const item of report.diagnostics) {
      lines.push(`${item.code} ${item.subject}${item.expected === undefined ? "" : ` expected=${JSON.stringify(item.expected)}`}${item.actual === undefined ? "" : ` actual=${JSON.stringify(item.actual)}`}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = JSON.parse(fs.readFileSync(args.profile, "utf8"));
  const rules = JSON.parse(fs.readFileSync(args.rules, "utf8"));
  if (rules.allowlist.length !== 0) throw new Error("mapping allowlist must remain empty");
  const target = readDeclarationModel(args.declarations);
  let reference = null;
  let expected = null;
  let diagnostics;
  if (args.leakOnly) {
    diagnostics = leakDiagnostics(target);
  } else {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-api-compat-"));
    try {
      reference = readReference(args.referenceDir, profile, temporary);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
    const transformed = transformReference(reference, rules);
    expected = { types: transformed.types };
    if (args.expectedOutput) {
      fs.writeFileSync(args.expectedOutput, `${JSON.stringify(expected, null, 2)}\n`);
    }
    diagnostics = compareTypes(expected, target, [
      ...transformed.mappingDiagnostics,
      ...leakDiagnostics(target),
    ], rules);
  }
  const report = {
    summary: summary(reference, expected, target, diagnostics, rules),
    diagnostics,
  };
  const output = args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : textReport(report, args.summaryOnly);
  if (args.output) fs.writeFileSync(args.output, output);
  else process.stdout.write(output);
  if (diagnostics.length > 0 && !args.reportOnly) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}

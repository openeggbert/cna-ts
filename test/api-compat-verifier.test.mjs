import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readDeclarationModel } from "../tools/api-compat/lib/declarations.mjs";
import { compareTypes, transformReference } from "../tools/api-compat/verify.mjs";

const rules = {
  ...JSON.parse(fs.readFileSync(new URL("../tools/api-compat/mapping-rules.json", import.meta.url), "utf8")),
  syntheticTypes: [],
};

function parameter(name, type) {
  return { name, type, out: false, optional: false };
}

function generic(name, position, attributes = "None", constraints = []) {
  return { name, position, attributes, constraints };
}

function method(name, returnType, parameters, genericParameters = []) {
  return {
    kind: "method",
    name,
    access: "public",
    static: false,
    abstract: false,
    final: false,
    genericArity: genericParameters.length,
    genericParameters,
    returnType,
    parameters,
  };
}

const reference = {
  profile: "generic verifier fixture",
  types: [
    {
      name: "Microsoft.Xna.Framework.IGenericContract",
      kind: "interface",
      access: "public",
      abstract: true,
      sealed: false,
      genericArity: 0,
      genericParameters: [],
      baseType: null,
      interfaces: [],
      members: [],
    },
    {
      name: "Microsoft.Xna.Framework.IMapper`2",
      kind: "interface",
      access: "public",
      abstract: true,
      sealed: false,
      genericArity: 2,
      genericParameters: [generic("TFirst", 0), generic("TSecond", 1)],
      baseType: null,
      interfaces: [],
      members: [method("Map", "!0", [parameter("value", "!1")])],
    },
    {
      name: "Microsoft.Xna.Framework.GenericFixture`2",
      kind: "class",
      access: "public",
      abstract: false,
      sealed: false,
      genericArity: 2,
      genericParameters: [generic("TFirst", 0), generic("TSecond", 1, "None", ["!0"])],
      baseType: "System.Object",
      interfaces: ["Microsoft.Xna.Framework.IMapper`2[!0,!1[]]"],
      members: [method("Map", "!0", [parameter("value", "!1[]")])],
    },
    {
      name: "Microsoft.Xna.Framework.GraphicsFixture",
      kind: "class",
      access: "public",
      abstract: false,
      sealed: false,
      genericArity: 0,
      genericParameters: [],
      baseType: "System.Object",
      interfaces: [],
      members: [method(
        "Draw",
        "!!0",
        [parameter("values", "System.Collections.Generic.Dictionary`2[System.String,!!0[]]")],
        [generic(
          "T",
          0,
          "NotNullableValueTypeConstraint, DefaultConstructorConstraint",
          ["Microsoft.Xna.Framework.IGenericContract"],
        )],
      )],
    },
  ],
};

function clone(value) {
  return structuredClone(value);
}

test("API verifier measures generic identity, constraints, and nested substitution", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-generic-verifier-"));
  try {
    const declarationRoot = path.join(temporary, "Microsoft", "Xna", "Framework");
    fs.mkdirSync(declarationRoot, { recursive: true });
    fs.writeFileSync(path.join(declarationRoot, "GenericFixture.d.ts"), `
export interface IGenericContract {}
export interface IMapper<TFirst, TSecond> { Map(value: TSecond): TFirst; }
export declare class GenericFixture<TFirst, TSecond extends TFirst>
  implements IMapper<TFirst, TSecond[]> {
  Map(value: TSecond[]): TFirst;
}
export declare class GraphicsFixture {
  Draw<T extends IGenericContract>(values: Map<string, T[]>): T;
}
`);

    const expected = { types: transformReference(reference, rules).types };
    const target = readDeclarationModel(declarationRoot);
    assert.deepEqual(compareTypes(expected, target, [], rules), []);

    const wrongOrder = clone(target);
    const genericFixture = wrongOrder.types.find((value) => value.name.endsWith(".GenericFixture"));
    [genericFixture.genericParameters[0].name, genericFixture.genericParameters[1].name] =
      [genericFixture.genericParameters[1].name, genericFixture.genericParameters[0].name];
    assert.ok(compareTypes(expected, wrongOrder, [], rules).some((value) =>
      value.code === "GENERIC_MISMATCH" && value.subject.endsWith("GenericFixture.genericParameters")));

    const missingMethodConstraint = clone(target);
    const draw = missingMethodConstraint.types.find((value) => value.name.endsWith(".GraphicsFixture"))
      .members.find((value) => value.name === "Draw");
    draw.genericParameters[0].constraint = null;
    assert.ok(compareTypes(expected, missingMethodConstraint, [], rules).some((value) =>
      value.code === "GENERIC_MISMATCH" && value.subject.includes("GraphicsFixture.method:Draw")));

    const brokenNestedSubstitution = clone(target);
    brokenNestedSubstitution.types.find((value) => value.name.endsWith(".GenericFixture"))
      .interfaces[0] = "Microsoft.Xna.Framework.IMapper<TFirst,TSecond>";
    assert.ok(compareTypes(expected, brokenNestedSubstitution, [], rules).some((value) =>
      value.code === "INTERFACE_MISMATCH" && value.subject.endsWith(".GenericFixture")));

    const projectedDraw = expected.types.find((value) => value.name.endsWith(".GraphicsFixture"))
      .members.find((value) => value.name === "Draw");
    assert.equal(projectedDraw.genericParameters[0].constraint, "Microsoft.Xna.Framework.IGenericContract");
    assert.equal(projectedDraw.parameters[0].type, "Map<string,T[]>");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

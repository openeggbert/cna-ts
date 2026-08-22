import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const FRAMEWORK_PATH = ["Microsoft", "Xna", "Framework"];

function declarationFiles(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...declarationFiles(absolute));
    } else if (entry.name.endsWith(".d.ts")) {
      result.push(absolute);
    }
  }
  return result.sort();
}

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function access(node) {
  return hasModifier(node, ts.SyntaxKind.ProtectedKeyword) ? "protected" : "public";
}

function declarationName(root, declaration) {
  const source = declaration.getSourceFile?.();
  if (!source || !source.fileName.endsWith(".d.ts")) {
    return null;
  }
  const relative = path.relative(root, source.fileName);
  if (relative.startsWith("..")) {
    return null;
  }
  const components = path.resolve(source.fileName).split(path.sep);
  const microsoft = components.lastIndexOf("Microsoft");
  if (microsoft < 0 || components.slice(microsoft, microsoft + 3).join("/") !== FRAMEWORK_PATH.join("/")) {
    return null;
  }
  const namespace = components.slice(microsoft, -1);
  const name = declaration.name?.text;
  return name ? [...namespace, name].join(".") : null;
}

function resolveTypeName(root, checker, node) {
  let location = node;
  while (ts.isQualifiedName(location)) {
    location = location.right;
  }
  let symbol = checker.getSymbolAtLocation(location);
  if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  if (symbol) {
    for (const declaration of symbol.declarations ?? []) {
      const fullName = declarationName(root, declaration);
      if (fullName) {
        return fullName;
      }
    }
  }
  return node.getText();
}

function typeText(root, checker, node) {
  if (!node) return "unknown";
  const keywords = new Map([
    [ts.SyntaxKind.AnyKeyword, "any"],
    [ts.SyntaxKind.UnknownKeyword, "unknown"],
    [ts.SyntaxKind.NumberKeyword, "number"],
    [ts.SyntaxKind.BigIntKeyword, "bigint"],
    [ts.SyntaxKind.BooleanKeyword, "boolean"],
    [ts.SyntaxKind.StringKeyword, "string"],
    [ts.SyntaxKind.VoidKeyword, "void"],
    [ts.SyntaxKind.NeverKeyword, "never"],
    [ts.SyntaxKind.UndefinedKeyword, "undefined"],
    [ts.SyntaxKind.NullKeyword, "null"],
    [ts.SyntaxKind.ObjectKeyword, "object"],
  ]);
  if (keywords.has(node.kind)) return keywords.get(node.kind);
  if (ts.isTypeReferenceNode(node)) {
    const base = resolveTypeName(root, checker, node.typeName);
    const argumentsText = node.typeArguments?.map((argument) => typeText(root, checker, argument)) ?? [];
    return argumentsText.length === 0 ? base : `${base}<${argumentsText.join(",")}>`;
  }
  if (ts.isExpressionWithTypeArguments(node)) {
    const base = resolveTypeName(root, checker, node.expression);
    const argumentsText = node.typeArguments?.map((argument) => typeText(root, checker, argument)) ?? [];
    return argumentsText.length === 0 ? base : `${base}<${argumentsText.join(",")}>`;
  }
  if (ts.isArrayTypeNode(node)) return `${typeText(root, checker, node.elementType)}[]`;
  if (ts.isUnionTypeNode(node)) {
    return node.types.map((value) => typeText(root, checker, value)).sort().join("|");
  }
  if (ts.isParenthesizedTypeNode(node)) return typeText(root, checker, node.type);
  if (ts.isTypeOperatorNode(node)) return typeText(root, checker, node.type);
  if (ts.isLiteralTypeNode(node)) return node.literal.getText();
  if (ts.isFunctionTypeNode(node)) {
    const parameters = node.parameters.map((parameter) => typeText(root, checker, parameter.type));
    return `(${parameters.join(",")})=>${typeText(root, checker, node.type)}`;
  }
  if (ts.isTupleTypeNode(node)) {
    return `[${node.elements.map((value) => typeText(root, checker, value)).join(",")}]`;
  }
  return node.getText().replace(/\s+/g, "");
}

function genericParameters(root, checker, values) {
  return (values ?? []).map((parameter, position) => ({
    name: parameter.name.text,
    position,
    constraint: parameter.constraint ? typeText(root, checker, parameter.constraint) : null,
  }));
}

function parameters(root, checker, values) {
  return values.map((parameter) => ({
    name: parameter.name.getText(),
    type: typeText(root, checker, parameter.type),
    optional: Boolean(parameter.questionToken || parameter.initializer),
    rest: Boolean(parameter.dotDotDotToken),
  }));
}

function callable(root, checker, kind, name, node) {
  return {
    kind,
    name,
    access: access(node),
    static: hasModifier(node, ts.SyntaxKind.StaticKeyword),
    abstract: hasModifier(node, ts.SyntaxKind.AbstractKeyword),
    genericArity: node.typeParameters?.length ?? 0,
    genericParameters: genericParameters(root, checker, node.typeParameters),
    returnType: kind === "constructor" ? null : typeText(root, checker, node.type),
    parameters: parameters(root, checker, node.parameters),
  };
}

function heritage(root, checker, node, token) {
  return (node.heritageClauses ?? [])
    .filter((clause) => clause.token === token)
    .flatMap((clause) => clause.types.map((value) => typeText(root, checker, value)));
}

function readMembers(root, checker, declaration, fullName, kind) {
  if (kind === "enum") {
    return declaration.members.map((member) => ({
      kind: "field",
      name: member.name.getText().replace(/["']/g, ""),
      access: "public",
      type: fullName,
      static: true,
      final: true,
      constant: checker.getConstantValue(member)?.toString() ?? null,
    }));
  }

  const result = [];
  const properties = new Map();
  for (const member of declaration.members ?? []) {
    if (member.name && ts.isPrivateIdentifier(member.name)) continue;
    if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) continue;
    if (ts.isConstructorDeclaration(member)) {
      result.push(callable(root, checker, "constructor", ".ctor", member));
    } else if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
      result.push(callable(root, checker, "method", member.name.getText(), member));
    } else if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
      result.push({
        kind: "field",
        name: member.name.getText(),
        access: access(member),
        type: typeText(root, checker, member.type),
        static: hasModifier(member, ts.SyntaxKind.StaticKeyword),
        final: hasModifier(member, ts.SyntaxKind.ReadonlyKeyword),
        constant: null,
      });
    } else if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
      const name = member.name.getText();
      const key = `${hasModifier(member, ts.SyntaxKind.StaticKeyword)}:${name}`;
      const property = properties.get(key) ?? {
        kind: "property",
        name,
        type: "unknown",
        static: hasModifier(member, ts.SyntaxKind.StaticKeyword),
        getterAccess: "none",
        setterAccess: "none",
        parameters: [],
      };
      if (ts.isGetAccessorDeclaration(member)) {
        property.getterAccess = access(member);
        property.type = typeText(root, checker, member.type);
      } else {
        property.setterAccess = access(member);
        property.type = typeText(root, checker, member.parameters[0]?.type);
      }
      properties.set(key, property);
    }
  }
  result.push(...properties.values());
  return result;
}

function readDeclaration(root, checker, declaration) {
  const fullName = declarationName(root, declaration);
  if (!fullName) return null;
  let kind;
  if (ts.isClassDeclaration(declaration)) kind = "class";
  else if (ts.isInterfaceDeclaration(declaration)) kind = "interface";
  else if (ts.isEnumDeclaration(declaration)) kind = "enum";
  else if (ts.isTypeAliasDeclaration(declaration) && ts.isFunctionTypeNode(declaration.type)) kind = "delegate";
  else return null;

  const baseTypes = heritage(root, checker, declaration, ts.SyntaxKind.ExtendsKeyword);
  const interfaces = heritage(root, checker, declaration, ts.SyntaxKind.ImplementsKeyword);
  if (kind === "interface") interfaces.push(...baseTypes.splice(0));
  return {
    name: fullName,
    kind,
    access: "public",
    abstract: kind === "interface" || hasModifier(declaration, ts.SyntaxKind.AbstractKeyword),
    sealed: false,
    genericArity: declaration.typeParameters?.length ?? 0,
    genericParameters: genericParameters(root, checker, declaration.typeParameters),
    baseType: baseTypes[0] ?? null,
    interfaces: interfaces.sort(),
    members:
      kind === "delegate"
        ? [callable(root, checker, "method", "Invoke", declaration.type, declaration.type)]
        : readMembers(root, checker, declaration, fullName, kind),
  };
}

export function readDeclarationModel(root) {
  const absoluteRoot = path.resolve(root);
  const files = declarationFiles(absoluteRoot);
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: false,
    noEmit: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (value) => value,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }));
  }
  const checker = program.getTypeChecker();
  const types = [];
  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(absoluteRoot) || !source.fileName.endsWith(".d.ts")) continue;
    for (const statement of source.statements) {
      const value = readDeclaration(absoluteRoot, checker, statement);
      if (value) types.push(value);
    }
  }
  types.sort((left, right) => left.name.localeCompare(right.name));
  return { schemaVersion: 1, types };
}

export function memberSignature(member) {
  if (member.kind === "constructor" || member.kind === "method") {
    const generic = member.genericArity ? `<${member.genericArity}>` : "";
    const parametersText = member.parameters
      .map((value) => `${value.rest ? "..." : ""}${value.type}${value.optional ? "?" : ""}`)
      .join(",");
    return `${member.static ? "static " : ""}${member.name}${generic}(${parametersText})->${member.returnType ?? "void"}`;
  }
  return `${member.static ? "static " : ""}${member.name}:${member.type}`;
}

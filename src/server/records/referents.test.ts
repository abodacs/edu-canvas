import { describe, expect, it } from "vitest";
import { z } from "zod";

import { writeInputReferents, writeInputSchemas } from "./inputs";

interface JsonSchemaNode {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchemaNode;
  readonly anyOf?: readonly JsonSchemaNode[];
}

const toJsonSchema = (schema: z.ZodType): JsonSchemaNode =>
  z.toJSONSchema(schema, { io: "input" }) as JsonSchemaNode;

const collectIdPaths = (node: JsonSchemaNode, prefix = ""): string[] => {
  const paths: string[] = [];
  const { properties } = node;
  if (properties) {
    for (const [key, child] of Object.entries(properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (/Ids?$/u.test(key)) {
        paths.push(path);
      }
      paths.push(...collectIdPaths(child, path));
    }
  }
  const { items } = node;
  if (items) {
    paths.push(...collectIdPaths(items, prefix));
  }
  const branches = node.anyOf;
  if (branches) {
    for (const branch of branches) {
      paths.push(...collectIdPaths(branch, prefix));
    }
  }
  return paths;
};

const doesPathExist = (node: JsonSchemaNode, path: string): boolean => {
  const [head, ...rest] = path.split(".");
  if (!head) {
    return false;
  }
  const child = node.properties?.[head] ?? node.items;
  return (
    child !== undefined &&
    (rest.length === 0 || doesPathExist(child.items ?? child, rest.join(".")))
  );
};

describe("record referent sweep", () => {
  it("declares a scope validator for every identifier in every write input", () => {
    for (const [action, schema] of Object.entries(writeInputSchemas)) {
      const declared =
        writeInputReferents[action as keyof typeof writeInputSchemas];
      const declaredPaths = new Set(declared.map((entry) => entry.path));
      const derived = collectIdPaths(toJsonSchema(schema));

      for (const path of derived) {
        expect(
          declaredPaths.has(path),
          `${action}.${path} has no scope validator`
        ).toBeTruthy();
      }

      for (const entry of declared) {
        expect(doesPathExist(toJsonSchema(schema), entry.path)).toBeTruthy();
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { writeInputReferents, writeInputSchemas } from "./inputs";
import type { WriteAction } from "./inputs";

const isWriteAction = (action: string): action is WriteAction =>
  action in writeInputSchemas;

interface JsonSchemaNode {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchemaNode;
  readonly anyOf?: readonly JsonSchemaNode[];
}

const jsonSchemaNodeSchema: z.ZodType<JsonSchemaNode> = z.object({
  type: z.string().optional(),
  properties: z
    .record(
      z.string(),
      z.lazy(() => jsonSchemaNodeSchema)
    )
    .optional(),
  required: z.array(z.string()).optional(),
  items: z.lazy(() => jsonSchemaNodeSchema).optional(),
  anyOf: z.array(z.lazy(() => jsonSchemaNodeSchema)).optional(),
});

const toJsonSchema = (schema: z.ZodType): JsonSchemaNode =>
  jsonSchemaNodeSchema.parse(z.toJSONSchema(schema, { io: "input" }));

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
  const direct = node.properties?.[head];
  const fromItems = node.items?.properties?.[head];
  const fromBranches = (node.anyOf ?? []).flatMap((branch) => {
    const child = branch.properties?.[head] ?? branch.items?.properties?.[head];
    return child === undefined ? [] : [child];
  });
  const children = [direct, fromItems, ...fromBranches].filter(
    (child): child is JsonSchemaNode => child !== undefined
  );
  return children.some(
    (child) => rest.length === 0 || doesPathExist(child, rest.join("."))
  );
};

describe("record referent sweep", () => {
  it("declares a scope validator for every identifier in every write input", () => {
    for (const [action, schema] of Object.entries(writeInputSchemas)) {
      if (!isWriteAction(action)) {
        throw new Error(`Unknown write action: ${action}`);
      }
      const declared = writeInputReferents[action];
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

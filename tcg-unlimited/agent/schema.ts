// Small JSON Schema subset shared by tool definitions and runtime input checks.
export type Schema = {
  type: "object" | "array" | "string" | "integer" | "boolean";
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
};

export const str = (maxLength = 120, minLength = 1): Schema => ({
  type: "string",
  minLength,
  maxLength,
});
export const id: Schema = { ...str(64), pattern: "^[a-zA-Z0-9_-]+$" };
export const enumOf = (...values: string[]): Schema => ({
  type: "string",
  enum: values,
});
export const int = (minimum = 0, maximum = 200): Schema => ({
  type: "integer",
  minimum,
  maximum,
});
export const bool: Schema = { type: "boolean" };
export const arr = (items: Schema, maxItems = 256, minItems = 0): Schema => ({
  type: "array",
  items,
  minItems,
  maxItems,
});
export const obj = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export function assertSchema(
  schema: Schema,
  value: unknown,
  path = "arguments",
): void {
  const fail = (detail: string): never => {
    throw new Error(`${path}: ${detail}`);
  };
  switch (schema.type) {
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value))
        fail("expected an object");
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? [])
        if (!Object.hasOwn(record, key)) fail(`missing ${key}`);
      for (const key of Object.keys(record)) {
        const child =
          schema.properties && Object.hasOwn(schema.properties, key)
            ? schema.properties[key]
            : undefined;
        if (!child) fail(`unknown property ${key}`);
        assertSchema(child!, record[key], `${path}.${key}`);
      }
      break;
    }
    case "array":
      if (!Array.isArray(value)) fail("expected an array");
      if (
        (value as unknown[]).length < (schema.minItems ?? 0) ||
        (value as unknown[]).length > (schema.maxItems ?? 256)
      )
        fail("array length out of range");
      (value as unknown[]).forEach((item, i) =>
        assertSchema(schema.items!, item, `${path}[${i}]`),
      );
      break;
    case "string":
      if (typeof value !== "string") fail("expected a string");
      if (
        (value as string).length < (schema.minLength ?? 0) ||
        (value as string).length > (schema.maxLength ?? 2000)
      )
        fail("string length out of range");
      if (schema.enum && !schema.enum.includes(value as string))
        fail(`choose ${schema.enum.join(", ")}`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value as string))
        fail("invalid ID");
      break;
    case "integer":
      if (
        !Number.isInteger(value) ||
        (value as number) < schema.minimum! ||
        (value as number) > schema.maximum!
      )
        fail(`expected an integer from ${schema.minimum} to ${schema.maximum}`);
      break;
    case "boolean":
      if (typeof value !== "boolean") fail("expected a boolean");
  }
}

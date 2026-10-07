// Minimal JSON Schema validator for the subset our task schemas use: type (object, array,
// string, integer, number, boolean), properties, required, additionalProperties: false,
// items, minItems, maxItems, minLength, maxLength, minimum, maximum, enum.
// Returns a list of problems ([] = valid). No dependencies so the gateway stays small.
export function validate(schema, value, path = "$") {
  const problems = [];
  const type = schema.type;
  const typeOk = {
    object: () => value !== null && typeof value === "object" && !Array.isArray(value),
    array: () => Array.isArray(value),
    string: () => typeof value === "string",
    integer: () => Number.isInteger(value),
    number: () => typeof value === "number" && Number.isFinite(value),
    boolean: () => typeof value === "boolean",
  };
  if (type && !typeOk[type]?.()) return [`${path}: expected ${type}`];
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path}: must be one of ${schema.enum.join(", ")}`);

  if (type === "string") {
    if (schema.minLength != null && value.trim().length < schema.minLength) problems.push(`${path}: too short`);
    if (schema.maxLength != null && value.length > schema.maxLength) problems.push(`${path}: too long`);
  }
  if (type === "integer" || type === "number") {
    if (schema.minimum != null && value < schema.minimum) problems.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) problems.push(`${path}: above ${schema.maximum}`);
  }
  if (type === "array") {
    if (schema.minItems != null && value.length < schema.minItems) problems.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) problems.push(`${path}: at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => problems.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  if (type === "object") {
    for (const key of schema.required || []) if (!(key in value)) problems.push(`${path}.${key}: missing`);
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) problems.push(...validate(sub, value[key], `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) problems.push(`${path}.${key}: not allowed`);
    }
  }
  return problems;
}

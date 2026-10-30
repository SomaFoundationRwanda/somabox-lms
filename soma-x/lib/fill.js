// Fills {placeholders} in a translated string: fill("Hi {name}", { name: "Ana" }) -> "Hi Ana".
export const fill = (text, vars = {}) => String(text || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));

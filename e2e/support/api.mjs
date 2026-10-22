// Straight-to-the-API helpers for setting the scene (a course, a quiz, a submission) so each test
// spends its browser time on the thing it is actually testing.
import { API_URL, PASSWORD, USERS } from "./env.mjs";

const tokens = {};

export async function api(method, path, { as, token, body } = {}) {
  const bearer = token || (as ? await tokenFor(as) : null);
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} as ${as || "token"} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

export async function tokenFor(role) {
  if (!tokens[role]) {
    const { email } = USERS[role];
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`);
    tokens[role] = (await res.json()).token;
  }
  return tokens[role];
}

// A short unique suffix so names created by different tests never collide in the shared school.
export const uid = () => Math.random().toString(36).slice(2, 7);

// Multipart upload (the content manager, library and course files take one file field).
export async function upload(method, path, { as, field = "file", file, fields = {} }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(field, new Blob([file.buffer], { type: file.mimeType }), file.name);
  const res = await fetch(`${API_URL}${path}`, { method, headers: { Authorization: `Bearer ${await tokenFor(as)}` }, body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} as ${as} -> ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

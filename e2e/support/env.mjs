// Shared by the server script, the Playwright config and the tests.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKEND_PORT = 3100;
export const FRONTEND_PORT = 3101;
export const API_URL = `http://localhost:${BACKEND_PORT}`;
export const APP_URL = `http://localhost:${FRONTEND_PORT}`;

export const PASSWORD = "e2e-password";

// Seeded by server.mjs. The built-in admin@mail.com / admin (must change its password) is
// left for the first-login test.
export const USERS = {
  admin: { email: "admin@e2e.test", name: "Ada Admin", role: "admin" },
  teacher: { email: "teacher@e2e.test", name: "Tom Teacher", role: "teacher" },
  teacher2: { email: "teacher2@e2e.test", name: "Tina Teacher", role: "teacher" },
  learner: { email: "learner@e2e.test", name: "Lea Learner", role: "scholar" },
  learner2: { email: "learner2@e2e.test", name: "Leo Learner", role: "scholar" },
};

// Saved sessions, one per role (written by auth.setup.mjs).
export const authFile = (role) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../.auth", `${role}.json`);

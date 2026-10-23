// Shared by the server script, the Playwright config and the tests.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKEND_PORT = 3100;
export const FRONTEND_PORT = 3101;
export const API_URL = `http://localhost:${BACKEND_PORT}`;
export const APP_URL = `http://localhost:${FRONTEND_PORT}`;

export const PASSWORD = "e2e-password";
// The box's one-time setup code (server.mjs presets it; auth.setup.mjs sets the box up with it).
export const SETUP_CODE = "E2E1-SETUP";
export const SCHOOL_NAME = "SOMABOX Partner School";

// Seeded by server.mjs, with their profiles already complete so the first-time profile form
// (tested in onboarding.spec) doesn't cover every page. The admin isn't seeded: auth.setup.mjs
// creates it by setting up the box with its setup code, as on a new box.
export const USERS = {
  admin: { email: "admin@e2e.test", name: "Ada Admin", role: "admin" },
  teacher: { email: "teacher@e2e.test", name: "Tom Teacher", role: "teacher" },
  teacher2: { email: "teacher2@e2e.test", name: "Tina Teacher", role: "teacher" },
  learner: { email: "learner@e2e.test", name: "Lea Learner", role: "scholar" },
  learner2: { email: "learner2@e2e.test", name: "Leo Learner", role: "scholar" },
};

// Saved sessions, one per role (written by auth.setup.mjs).
export const authFile = (role) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../.auth", `${role}.json`);

// Starts or builds SOMABOX with the settings from the repo's single .env (@somabox/config):
//   node scripts/somabox.mjs dev       backend + frontend
//   node scripts/somabox.mjs dev:all   backend + frontend + AI runtime + AI gateway
//   node scripts/somabox.mjs dev:ai    AI runtime + AI gateway
//   node scripts/somabox.mjs build     production build of the frontend
//   node scripts/somabox.mjs check     settings and free ports, before pm2 starts everything
//   node scripts/somabox.mjs env:migrate   move the old per-app .env files into the root .env
// Each process gets its own environment (not `PORT=... cmd`, which Windows shells don't run).
import { spawn } from "node:child_process";
import concurrently from "concurrently";
import somabox from "@somabox/config";

const target = process.argv[2];

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (target === "env:migrate") {
  const { added, skipped, renamed } = somabox.migrateEnvFiles();
  if (!renamed.length) {
    console.log("Nothing to move: there are no per-app .env files.");
  } else {
    console.log(`Moved into .env:\n${added.map((a) => `  ${a}`).join("\n") || "  (nothing new)"}`);
    if (skipped.length) console.log(`Not moved:\n${skipped.map((s) => `  ${s}`).join("\n")}`);
    console.log(`Renamed:\n${renamed.map((r) => `  ${r}`).join("\n")}\nCheck the root .env, then delete the .migrated files.`);
  }
  process.exit(0);
}

let config;
try {
  config = somabox.readConfig();
} catch (err) {
  fail(err.message);
}
const ROOT = somabox.root();
const { ports, serverUrl } = config;

const backend = {
  name: "BACKEND", prefixColor: "cyan",
  command: "pnpm --filter soma-x-backend run dev",
  env: { PORT: String(ports.BACKEND_PORT), AI_GATEWAY_PORT: String(ports.AI_GATEWAY_PORT) },
};
const frontend = {
  name: "FRONTEND", prefixColor: "magenta",
  // The backend address it calls comes from the same .env, in soma-x/next.config.mjs.
  command: `pnpm --filter soma-x exec next dev -p ${ports.FRONTEND_PORT}`,
  env: {},
};
const aiRuntime = {
  name: "AI-MODEL", prefixColor: "yellow",
  command: "bash ai/runtime/start_runtime.sh",
  env: { AI_RUNTIME_PORT: String(ports.AI_RUNTIME_PORT) },
};
const aiGateway = {
  name: "AI-GATEWAY", prefixColor: "green",
  command: "pnpm --filter ai-gateway run start",
  env: { AI_GATEWAY_PORT: String(ports.AI_GATEWAY_PORT), AI_RUNTIME_PORT: String(ports.AI_RUNTIME_PORT) },
};

const GROUPS = {
  dev: { commands: [backend, frontend], ports: ["BACKEND_PORT", "FRONTEND_PORT"] },
  "dev:all": { commands: [backend, frontend, aiRuntime, aiGateway], ports: ["BACKEND_PORT", "FRONTEND_PORT", "AI_RUNTIME_PORT", "AI_GATEWAY_PORT"] },
  "dev:ai": { commands: [aiRuntime, aiGateway], ports: ["AI_RUNTIME_PORT", "AI_GATEWAY_PORT"] },
};

if (target === "build") {
  // The backend address is built into the frontend (soma-x/next.config.mjs reads the .env).
  console.log(`Building the frontend to call ${serverUrl}`);
  const child = spawn("pnpm --filter soma-x run build", { cwd: ROOT, stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code ?? 1));
} else if (target === "check") {
  try {
    await somabox.assertPortsFree(ports, ["BACKEND_PORT", "FRONTEND_PORT"]);
  } catch (err) {
    fail(`${err.message}\n(If SOMABOX is already running under pm2, use pnpm pm2:restart instead.)`);
  }
  console.log(`Backend :${ports.BACKEND_PORT}, frontend :${ports.FRONTEND_PORT}, frontend calls ${serverUrl}`);
} else if (GROUPS[target]) {
  const group = GROUPS[target];
  try {
    await somabox.assertPortsFree(ports, group.ports);
  } catch (err) {
    fail(err.message);
  }
  const shown = group.ports.map((name) => `${name.replace(/_PORT$/, "").toLowerCase().replace("_", " ")} :${ports[name]}`).join(", ");
  console.log(`SOMABOX: ${shown}${group.ports.includes("FRONTEND_PORT") ? `; frontend calls ${serverUrl}` : ""}`);
  const { result } = concurrently(
    group.commands.map((c) => ({ ...c, cwd: ROOT, env: { ...process.env, ...c.env } })),
    { prefix: "name" },
  );
  result.then(() => process.exit(0), () => process.exit(1));
} else {
  fail(`Unknown target "${target}". Use dev, dev:all, dev:ai, build, check or env:migrate.`);
}

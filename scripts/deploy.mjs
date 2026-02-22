#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

// Load local env files for local execution. Existing process env wins.
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env", override: false });

const requiredEnvVars = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET"
];

const missing = requiredEnvVars.filter((name) => {
  const value = process.env[name];
  return !value || value.trim().length === 0;
});

if (missing.length > 0) {
  console.error("Missing required environment variables:");
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error("");
  console.error("Set the missing values and re-run this script.");
  process.exit(1);
}

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

run(npxCommand, ["prisma", "migrate", "deploy"]);
run(npxCommand, ["prisma", "generate"]);

console.log("");
console.log("Deployment prep complete.");
console.log("Next steps:");
console.log("1) Push committed changes.");
console.log("2) Ensure Vercel project env vars are set.");
console.log("3) Deploy on Vercel.");

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env
  });

  if (result.error) {
    console.error(`Failed to run command: ${command}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

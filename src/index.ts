#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFecServer } from "./server.js";

// Resolve .env against this file's own location, not process.cwd(). Claude
// Desktop/Code launches the server with its own working directory (commonly /
// or the app install dir), so a cwd-relative lookup silently misses the .env
// sitting next to the project and the server exits with no key. Real
// environment variables still win – dotenv does not overwrite what is already
// set, so an MCP config env block keeps taking precedence.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

try {
  const server = createFecServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

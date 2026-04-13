import { createServer } from "./server/mcp.js";

async function main(): Promise<void> {
  const server = await createServer();
  await server.start();
}

main().catch((error) => {
  console.error("discord-fetch-mcp failed to start", error);
  process.exit(1);
});

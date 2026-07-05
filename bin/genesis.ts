#!/usr/bin/env node
import { runCli } from "../genesis/cli/main.ts";

runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

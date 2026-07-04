#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { GenesisAgent } from "../core/agent.ts";
import { appendRun, loadConfig } from "../providers/config.ts";
import { createProvider } from "../providers/index.ts";
import { createDefaultToolRegistry } from "../tools/index.ts";

const PYTHON_CLI_MODULE = "backend.cli.main";
const PYTHON_COMMANDS = new Set([
  "init",
  "run",
  "compile",
  "chat",
  "resume",
  "status",
  "report",
  "config",
  "skills",
  "mcp"
]);

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (PYTHON_COMMANDS.has(command)) {
    runResearchCli([command, ...rest]);
    return;
  }

  if (command === "tools") {
    handleTools(rest);
    return;
  }

  if (command === "tool") {
    await handleTool(rest);
    return;
  }

  if (command === "agent") {
    const task = rest.join(" ").trim();
    if (!task) {
      throw new Error(`genesis ${command} requires task text.`);
    }
    await runAgentTask(task, true);
    return;
  }

  throw new Error(`未知命令：${command}`);
}

function runResearchCli(args: string[]): void {
  const python = process.env.GENESIS_PYTHON || "python";
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pythonPath = [repoRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  const result = spawnSync(python, ["-m", PYTHON_CLI_MODULE, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PYTHONPATH: pythonPath,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8"
    },
    stdio: "inherit"
  });

  if (result.error) {
    throw new Error(`Unable to start Python CLI: ${result.error.message}`);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
  }
  if (result.signal) {
    throw new Error(`Python CLI terminated by signal ${result.signal}`);
  }
}

async function runAgentTask(task: string, showTrace: boolean): Promise<void> {
  const agent = await createAgent();
  const result = await agent.run(task);
  try {
    await appendRun(result);
  } catch {
    // Compatibility persistence must not affect the headless debug agent result.
  }
  console.log(result.output);

  if (showTrace) {
    console.log("\n工具轨迹:");
    if (result.toolTrace.length === 0) {
      console.log("- 未调用工具");
    } else {
      for (const toolCall of result.toolTrace) {
        console.log(`- ${toolCall.name}: ${JSON.stringify(toolCall.input)}`);
      }
    }
  }
}

async function createAgent(): Promise<GenesisAgent> {
  const config = await loadConfig();
  const provider = createProvider(config);
  const registry = createDefaultToolRegistry(process.cwd());
  return new GenesisAgent(provider, registry, {
    model: config.model || undefined,
    maxSteps: config.max_steps ?? 6
  });
}

function handleTools(args: string[]): void {
  if (args[0] !== "list") {
    throw new Error("用法：genesis tools list");
  }
  const registry = createDefaultToolRegistry(process.cwd());
  for (const tool of registry.list()) {
    console.log(`- ${tool.name}: ${tool.description}`);
  }
}

async function handleTool(args: string[]): Promise<void> {
  const [subcommand, name, ...inputParts] = args;
  if (subcommand !== "call" || !name) {
    throw new Error("用法：genesis tool call <toolName> '<JSON input>' 或 genesis tool call <toolName> key=value");
  }
  const registry = createDefaultToolRegistry(process.cwd());
  const tool = registry.get(name);
  const result = await tool.run(parseToolInput(inputParts));
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

function parseToolInput(inputParts: string[]): unknown {
  if (inputParts.length === 0) {
    return {};
  }

  const raw = inputParts.join(" ");
  try {
    return JSON.parse(raw);
  } catch {
    const entries = inputParts
      .map((part) => part.split("="))
      .filter((parts) => parts.length >= 2)
      .map(([key, ...value]) => [key, value.join("=")] as const);

    if (entries.length > 0) {
      return Object.fromEntries(entries);
    }

    return { text: raw };
  }
}

function printHelp(): void {
  console.log(`Genesis CLI

Usage:
  genesis init
  genesis run "research idea"
  genesis chat
  genesis resume <runId>
  genesis compile "research idea"
  genesis status <runId>
  genesis report <runId>
  genesis skills list
  genesis skills inspect <skillId>
  genesis mcp list
  genesis mcp test <server> <toolName>
  genesis config show
  genesis config path
  genesis config set provider openai
  genesis config set apiKey <your-key>
  genesis config set baseURL <OpenAI-compatible URL>
  genesis config set models.planner gpt-4.1
  genesis config unset apiKey

Compatibility/debug commands:
  genesis agent "task"
  genesis tools list
  genesis tool call <toolName> '<JSON input>'
`);
}

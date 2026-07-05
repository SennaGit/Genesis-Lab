import process from "node:process";
import readline from "node:readline/promises";
import { GenesisRuntime } from "../core/runtime/agent_runtime.ts";
import { MCPToolRegistry } from "../mcp/registry.ts";
import { ModelRouter } from "../models/model_router.ts";
import { SessionStore } from "../memory/session_store.ts";
import { SkillRegistry } from "../skills/registry.ts";
import type { RuntimeEvent, RuntimeSession } from "../types/research.ts";
import { configPath, genesisHome, initGenesisHome, loadRuntimeConfig, mcpConfigPath, redactConfig, setRuntimeConfigValue, unsetRuntimeConfigValue } from "./config.ts";

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "init") {
    await handleInit(rest);
    return;
  }
  if (command === "run") {
    await handleRun(rest);
    return;
  }
  if (command === "chat") {
    await handleChat();
    return;
  }
  if (command === "resume") {
    await handleResume(rest);
    return;
  }
  if (command === "status") {
    await handleStatus(rest);
    return;
  }
  if (command === "report") {
    await handleReport(rest);
    return;
  }
  if (command === "skills") {
    await handleSkills(rest);
    return;
  }
  if (command === "mcp") {
    await handleMCP(rest);
    return;
  }
  if (command === "config") {
    await handleConfig(rest);
    return;
  }
  if (command === "doctor") {
    await handleDoctor();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

async function handleInit(args: string[]): Promise<void> {
  const paths = await initGenesisHome(args.includes("--force"));
  console.log("Genesis Research Runtime initialized");
  console.log(`home: ${paths.home}`);
  console.log(`config: ${paths.config}`);
  console.log(`mcp: ${paths.mcp}`);
  console.log(`sessions: ${paths.sessions}`);
}

async function handleRun(args: string[]): Promise<void> {
  const idea = args.join(" ").trim();
  if (!idea) {
    throw new Error('Usage: genesis run "research idea"');
  }
  await initGenesisHome(false);
  const runtime = new GenesisRuntime({ config: await loadRuntimeConfig() });
  const session = await runtime.run({ idea, onEvent: printRuntimeEvent });
  console.log("");
  console.log(`session_id: ${session.session_id}`);
  console.log(session.report);
}

async function handleChat(): Promise<void> {
  await initGenesisHome(false);
  console.log("Genesis research chat started. Type a research idea, or exit to quit.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = await rl.question("> ").catch(() => "exit");
      const idea = line.trim();
      if (!idea || idea === "exit" || idea === "quit") {
        break;
      }
      const runtime = new GenesisRuntime({ config: await loadRuntimeConfig() });
      const session = await runtime.run({ idea, onEvent: printRuntimeEvent });
      console.log(`session_id: ${session.session_id}`);
      console.log(session.report);
    }
  } finally {
    rl.close();
  }
}

async function handleResume(args: string[]): Promise<void> {
  const inspectOnly = args.includes("--inspect");
  const sessionId = args.find((arg) => arg !== "--continue" && arg !== "--inspect");
  if (!sessionId) {
    throw new Error("Usage: genesis resume <session_id> [--inspect]");
  }
  const runtime = new GenesisRuntime({ config: await loadRuntimeConfig() });
  const session = await runtime.resume(sessionId, { continue: !inspectOnly, onEvent: printRuntimeEvent });
  printSessionSummary(session);
  if (session.report) {
    console.log(session.report);
  }
}

async function handleStatus(args: string[]): Promise<void> {
  const sessionId = args[0];
  if (!sessionId) {
    throw new Error("Usage: genesis status <session_id>");
  }
  const store = new SessionStore();
  const session = await store.load(sessionId);
  printSessionSummary(session);
  console.log(`report_path: ${store.paths(sessionId).report}`);
  console.log(`evidence_map_path: ${store.paths(sessionId).evidenceMap}`);
}

async function handleReport(args: string[]): Promise<void> {
  const sessionId = args.find((arg) => arg !== "--path");
  if (!sessionId) {
    throw new Error("Usage: genesis report <session_id> [--path]");
  }
  const store = new SessionStore();
  if (args.includes("--path")) {
    console.log(store.paths(sessionId).report);
    return;
  }
  const session = await store.load(sessionId);
  if (!session.report) {
    throw new Error(`No report found for session ${sessionId}.`);
  }
  console.log(session.report);
}

async function handleSkills(args: string[]): Promise<void> {
  const [subcommand, id] = args;
  const registry = new SkillRegistry();
  if (!subcommand || subcommand === "list") {
    for (const skill of registry.list()) {
      console.log(`- ${skill.id}: ${skill.description}`);
    }
    return;
  }
  if (subcommand === "inspect") {
    if (!id) {
      throw new Error("Usage: genesis skills inspect <skill_id>");
    }
    console.log(JSON.stringify(registry.get(id), null, 2));
    return;
  }
  throw new Error("Usage: genesis skills list|inspect <skill_id>");
}

async function handleMCP(args: string[]): Promise<void> {
  const [subcommand, first, second] = args;
  const registry = MCPToolRegistry.fromConfigFile(mcpConfigPath());
  if (!subcommand || subcommand === "list") {
    for (const tool of registry.list()) {
      console.log(`- ${tool.name} (${tool.type})`);
    }
    return;
  }
  if (subcommand === "test") {
    const toolName = resolveMCPToolName(registry, first, second);
    if (!toolName) {
      throw new Error("Usage: genesis mcp test <tool_name> or genesis mcp test <server> <tool_name>");
    }
    const result = await registry.execute(toolName, { healthcheck: true });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error("Usage: genesis mcp list|test <tool_name>");
}

function resolveMCPToolName(registry: MCPToolRegistry, first?: string, second?: string): string | undefined {
  if (!first) {
    return undefined;
  }
  if (!second) {
    return first;
  }
  const names = [`${first}.${second}`, `${first}/${second}`, second];
  return names.find((name) => registry.has(name)) ?? `${first}.${second}`;
}
async function handleConfig(args: string[]): Promise<void> {
  const [subcommand, key, ...value] = args;
  if (!subcommand || subcommand === "show") {
    console.log(JSON.stringify(redactConfig(await loadRuntimeConfig()), null, 2));
    return;
  }
  if (subcommand === "path") {
    console.log(configPath());
    return;
  }
  if (subcommand === "set") {
    if (!key || value.length === 0) {
      throw new Error("Usage: genesis config set <key> <value>");
    }
    console.log(JSON.stringify(redactConfig(await setRuntimeConfigValue(key, value.join(" "))), null, 2));
    return;
  }
  if (subcommand === "unset") {
    if (!key) {
      throw new Error("Usage: genesis config unset <key>");
    }
    console.log(JSON.stringify(redactConfig(await unsetRuntimeConfigValue(key)), null, 2));
    return;
  }
  throw new Error("Usage: genesis config show|path|set|unset");
}

async function handleDoctor(): Promise<void> {
  await initGenesisHome(false);
  const config = await loadRuntimeConfig();
  const tools = MCPToolRegistry.fromConfigFile(mcpConfigPath());
  const router = new ModelRouter(config);
  const store = new SessionStore();
  const skills = new SkillRegistry();
  const checks = [
    ["home", genesisHome()],
    ["config", configPath()],
    ["mcp_config", mcpConfigPath()],
    ["provider", config.provider],
    ["planning_model", router.modelFor("planning")],
    ["execution_model", router.modelFor("execution")],
    ["critic_model", router.modelFor("critic")],
    ["synthesizer_model", router.modelFor("synthesizer")],
    ["mcp_tools", String(tools.list().length)],
    ["skills", String(skills.list().length)],
    ["sessions", store.sessionsRoot()],
    ["node", process.version],
    ["github_role", "capability_provider_only"]
  ];
  for (const [key, value] of checks) {
    console.log(`${key}: ${value}`);
  }
}

function printRuntimeEvent(event: RuntimeEvent): void {
  if (event.type === "plan") {
    console.log(`event=plan session_id=${event.session_id} nodes=${event.graph.research_graph.length}`);
  } else if (event.type === "node_start") {
    console.log(`event=node_start node_id=${event.node_id}`);
  } else if (event.type === "tool_result") {
    console.log(`event=tool_result node_id=${event.node_id} tool=${event.tool} ok=${event.ok}`);
  } else if (event.type === "critic_result") {
    console.log(`event=critic_result passed=${event.passed} status=${event.status} reasons=${event.reasons.join(",") || "none"}`);
  } else if (event.type === "replan") {
    console.log(`event=replan round=${event.round} reasons=${event.reasons.join(",")}`);
  } else if (event.type === "final_report") {
    console.log(`event=final_report session_id=${event.session_id} report_path=${event.report_path}`);
  }
}

function printSessionSummary(session: RuntimeSession): void {
  const finalReview = session.critic_rounds.at(-1);
  console.log(`session_id: ${session.session_id}`);
  console.log(`status: ${session.report ? "completed" : "in_progress"}`);
  console.log(`nodes: ${session.graph.research_graph.length}`);
  console.log(`executions: ${session.executions.length}`);
  console.log(`critic_status: ${finalReview?.status ?? "not_run"}`);
  console.log(`revisions: ${session.graph_revisions?.length ?? 0}`);
}

function printHelp(): void {
  console.log(`Genesis Research Runtime OS

Usage:
  genesis init
  genesis run "research idea"
  genesis chat
  genesis resume <session_id> [--inspect]
  genesis status <session_id>
  genesis report <session_id> [--path]
  genesis skills list
  genesis skills inspect <skill_id>
  genesis mcp list
  genesis mcp test <tool_name>
  genesis mcp test <server> <tool_name>
  genesis config show
  genesis config set provider openai
  genesis config set apiKey <key>
  genesis config set models.planning gpt-4.1
  genesis config set models.synthesizer gpt-4.1-mini
  genesis doctor
`);
}

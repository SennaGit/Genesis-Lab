import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { GenesisAgent } from "../core/agent.ts";
import { createInitialState } from "../core/state.ts";
import { appendRun, configPath, loadConfig, loadSessionState, saveSessionState, setConfigValue } from "../providers/config.ts";
import { createProvider } from "../providers/index.ts";
import { createDefaultToolRegistry } from "../tools/index.ts";

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "config") {
    await handleConfig(rest);
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

  if (command === "chat") {
    await chatMode();
    return;
  }

  if (command === "run" || command === "agent") {
    const task = rest.join(" ").trim();
    if (!task) {
      throw new Error(`genesis ${command} 需要任务文本。`);
    }
    await runAgentTask(task, command === "agent");
    return;
  }

  throw new Error(`未知命令：${command}`);
}

async function runAgentTask(task: string, showTrace: boolean): Promise<void> {
  const agent = await createAgent();
  const result = await agent.run(task);
  try {
    await appendRun(result);
  } catch {
    // CLI 持久化是辅助能力，不能影响 headless runtime 执行结果。
  }
  console.log(result.output);

  if (showTrace) {
    console.log("\n工具轨迹：");
    if (result.toolTrace.length === 0) {
      console.log("- 未调用工具");
    } else {
      for (const toolCall of result.toolTrace) {
        console.log(`- ${toolCall.name}: ${JSON.stringify(toolCall.input)}`);
      }
    }
  }
}

async function chatMode(): Promise<void> {
  const sessionId = "default";
  const agent = await createAgent();
  let state = await loadSessionState(sessionId) ?? createInitialState();
  const repl = readline.createInterface({ input, output });

  console.log("Genesis chat 已启动。输入 exit 退出。");
  while (true) {
    const answer = await askQuestion(repl, "> ");
    if (answer === undefined) {
      break;
    }

    const line = answer.trim();
    if (!line) {
      continue;
    }
    if (line === "exit" || line === "quit") {
      break;
    }
    const result = await agent.runWithState(line, state);
    state = result.state;
    await saveSessionState(sessionId, state);
    output.write("agent: ");
    await streamText(result.output);
    output.write("\n");
  }

  closeReadline(repl);
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

async function handleConfig(args: string[]): Promise<void> {
  const [subcommand, key, ...valueParts] = args;

  if (subcommand === "path") {
    console.log(configPath());
    return;
  }

  if (subcommand === "show") {
    const config = await loadConfig();
    const redacted = { ...config, apiKey: config.apiKey ? "******" : "" };
    console.log(JSON.stringify(redacted, null, 2));
    return;
  }

  if (subcommand === "set") {
    if (!key || valueParts.length === 0) {
      throw new Error("用法：genesis config set <配置项> <值>");
    }
    const config = await setConfigValue(key, valueParts.join(" "));
    console.log(`已更新配置：${key}`);
    console.log(JSON.stringify({ ...config, apiKey: config.apiKey ? "******" : "" }, null, 2));
    return;
  }

  throw new Error("用法：genesis config show | path | set <配置项> <值>");
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
    throw new Error(`用法：genesis tool call <工具名> '<JSON参数>' 或 genesis tool call <工具名> key=value`);
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

用法：
  genesis chat
  genesis run "任务"
  genesis agent "任务"
  genesis tools list
  genesis tool call <工具名> '<JSON参数>'
  genesis tool call <工具名> key=value
  genesis config show
  genesis config path
  genesis config set provider openai
  genesis config set api_key <你的密钥>
  genesis config set apiKey <你的密钥>
  genesis config set baseURL <OpenAI兼容地址>
  genesis config set model <模型名>

说明：
  默认 provider 是 mock，可离线验证 agent loop。
  真实模型可配置为 openai、anthropic 或 custom。
  所有面向用户的默认输出使用中文。
`);
}


async function streamText(text: string): Promise<void> {
  const chunkSize = Number(process.env.GENESIS_STREAM_CHUNK_SIZE ?? 12);
  const delayMs = Number(process.env.GENESIS_STREAM_DELAY_MS ?? 8);
  for (let index = 0; index < text.length; index += chunkSize) {
    output.write(text.slice(index, index + chunkSize));
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
async function askQuestion(repl: readline.Interface, prompt: string): Promise<string | undefined> {
  try {
    return await repl.question(prompt);
  } catch (error) {
    if (error instanceof Error && /readline was closed/i.test(error.message)) {
      return undefined;
    }
    throw error;
  }
}

function closeReadline(repl: readline.Interface): void {
  const state = repl as unknown as { closed?: boolean };
  if (!state.closed) {
    repl.close();
  }
}

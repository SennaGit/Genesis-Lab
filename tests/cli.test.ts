import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliEntry = path.resolve("bin", "genesis.ts");

function runGenesis(args: string[], genesisHome: string, input?: string) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GENESIS_HOME: genesisHome,
      GENESIS_STREAM_DELAY_MS: "0"
    },
    input,
    encoding: "utf8"
  });
}

test("CLI config set api_key 写入 ~/.genesis/config.json", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-config-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["config", "set", "api_key", "test-key"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /已更新配置：api_key/);

    const raw = await readFile(path.join(genesisHome, "config.json"), "utf8");
    const config = JSON.parse(raw);
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.api_key, undefined);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI run 调用 Agent Runtime 并输出结果", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-run-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["run", "列出当前目录文件"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /已根据工具观察完成任务/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI agent 输出 tool trace", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-agent-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["agent", "列出当前目录文件"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /工具轨迹/);
    assert.match(result.stdout, /list_files/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI chat 支持 REPL 输入和 streaming 输出", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-chat-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["chat"], genesisHome, "列出当前目录文件\nexit\n");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Genesis chat 已启动/);
    assert.match(result.stdout, /agent: /);
    assert.match(result.stdout, /已根据工具观察完成任务/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
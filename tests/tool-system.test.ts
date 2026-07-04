import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultToolRegistry, createDefaultToolRouter, DefaultToolRegistry, ToolRouter } from "../tools/index.ts";

const tempRootPrefix = path.join(os.tmpdir(), "genesis-tools-");

test("ToolRegistry 会校验并注册标准 JSON Schema 工具", async () => {
  const registry = new DefaultToolRegistry();
  registry.register({
    name: "echo.test",
    description: "测试回显工具。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "文本。" }
      },
      additionalProperties: false
    },
    run: async (input) => input
  });

  assert.equal(registry.has("echo.test"), true);
  assert.equal(registry.get("echo.test").inputSchema.type, "object");
  assert.throws(() => registry.register({
    name: "echo.test",
    description: "重复工具。",
    inputSchema: { type: "object" },
    run: async () => null
  }), /工具已注册/);
});

test("ToolRouter 可以 dispatch 本地 echo 工具", async () => {
  const router = createDefaultToolRouter(process.cwd());
  const result = await router.call("echo", { text: "你好" }, "call-1");

  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { text: "你好" });
  assert.equal(result.toolCallId, "call-1");
});

test("ToolRouter 可以调用 filesystem.read demo tool", async () => {
  const temp = await mkdtemp(tempRootPrefix);
  try {
    await writeFile(path.join(temp, "sample.txt"), "中文内容", "utf8");
    const router = createDefaultToolRouter(temp);
    const result = await router.call("filesystem.read", { path: "sample.txt" });

    assert.equal(result.ok, true);
    assert.equal(result.output, "中文内容");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("ToolRouter 对未知工具返回标准错误结果", async () => {
  const router = new ToolRouter(new DefaultToolRegistry());
  const result = await router.call("missing.tool", {});

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /未知工具/);
});

test("默认 registry 暴露 MCP forward 工具 schema", async () => {
  const registry = createDefaultToolRegistry(process.cwd());
  const tool = registry.get("mcp.forward");

  assert.equal(tool.inputSchema.type, "object");
  assert.deepEqual(tool.inputSchema.required, ["server", "toolName"]);
});
test("默认 registry 暴露 UI / Stitch / Figma 设计工具", async () => {
  const registry = createDefaultToolRegistry(process.cwd());

  assert.equal(registry.has("design.generate_ui"), true);
  assert.equal(registry.has("figma.export_nodes"), true);
  assert.equal(registry.has("stitch.transform_layout"), true);
});

test("design.generate_ui 只返回 headless UI 规格", async () => {
  const router = createDefaultToolRouter(process.cwd());
  const result = await router.call("design.generate_ui", {
    prompt: "生成科研工作台",
    target: "Genesis 工作台"
  });

  assert.equal(result.ok, true);
  const output = result.output as Record<string, unknown>;
  assert.equal(output.tool, "design.generate_ui");
  assert.equal(output.type, "ui_generation_spec");
  assert.match(String(output.dependencyBoundary), /ToolRouter/);
});

test("figma.export_nodes 输出标准化导出请求", async () => {
  const router = createDefaultToolRouter(process.cwd());
  const result = await router.call("figma.export_nodes", {
    fileKey: "file-1",
    nodeIds: ["1:2", "3:4"],
    format: "svg"
  });

  assert.equal(result.ok, true);
  const output = result.output as { tool?: string; nodes?: Array<{ artifactName: string }> };
  assert.equal(output.tool, "figma.export_nodes");
  assert.equal(output.nodes?.length, 2);
  assert.match(output.nodes?.[0]?.artifactName ?? "", /\.svg$/);
});
test("figma.export_nodes 兼容 CLI key=value 字符串 nodeIds", async () => {
  const router = createDefaultToolRouter(process.cwd());
  const result = await router.call("figma.export_nodes", {
    fileKey: "file-1",
    nodeIds: "1:2,3:4"
  });

  assert.equal(result.ok, true);
  const output = result.output as { nodes?: Array<{ id: string }> };
  assert.deepEqual(output.nodes?.map((node) => node.id), ["1:2", "3:4"]);
});

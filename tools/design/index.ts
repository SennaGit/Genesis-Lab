import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool } from "../types.ts";

type RecordInput = Record<string, unknown>;

const defaultLayoutPath = path.join("frontend", "stitch", "layout-json", "dashboard.json");

export function createDesignTools(root = process.cwd()): Tool[] {
  return [
    createDesignGenerateUITool(root),
    createFigmaExportNodesTool(),
    createStitchTransformLayoutTool(root)
  ];
}

function createDesignGenerateUITool(root: string): Tool {
  return {
    name: "design.generate_ui",
    description: "基于设计输入生成 headless UI 规格。该工具只输出结构化 UI 方案，不直接修改前端、不依赖 core runtime。",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "用户对 UI 的自然语言要求。" },
        target: { type: "string", description: "目标页面或组件名称。" },
        framework: { type: "string", description: "目标前端框架，例如 Next.js App Router。" },
        layoutPath: { type: "string", description: "可选的 Stitch layout JSON 相对路径。" },
        constraints: {
          type: "array",
          description: "额外设计约束。",
          items: { type: "string" }
        }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    run: async (input: unknown) => {
      const value = asRecord(input);
      const prompt = String(value.prompt ?? "");
      const layoutPath = typeof value.layoutPath === "string" ? value.layoutPath : defaultLayoutPath;
      const layout = await loadLayout(root, layoutPath);
      const constraints = Array.isArray(value.constraints) ? value.constraints.map(String) : [];

      return {
        type: "ui_generation_spec",
        tool: "design.generate_ui",
        language: "zh",
        target: String(value.target ?? layout.page ?? "Genesis 工作台"),
        framework: String(value.framework ?? "Next.js App Router + TypeScript"),
        prompt,
        constraints: [
          "UI 只能作为 tool output，不得成为 agent runtime 的核心依赖。",
          "生成结果必须保留业务契约，禁止在 UI 组件中直接调用 API。",
          ...constraints
        ],
        layout,
        suggestedFiles: [
          "frontend/ui/components",
          "frontend/ui/contracts",
          "frontend/features"
        ],
        dependencyBoundary: "CLI/Agent -> ToolRouter -> design.generate_ui -> structured UI spec"
      };
    }
  };
}

function createFigmaExportNodesTool(): Tool {
  return {
    name: "figma.export_nodes",
    description: "将 Figma file/node 输入标准化为可被 agent 消费的导出任务描述。MVP 不直接联网访问 Figma。",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string", description: "Figma 文件 key。" },
        nodeIds: {
          type: "array",
          description: "要导出的 Figma node id 列表。",
          items: { type: "string" }
        },
        format: {
          type: "string",
          description: "目标导出格式。",
          enum: ["json", "svg", "png"]
        },
        scale: { type: "number", description: "位图导出倍率。" }
      },
      required: ["fileKey", "nodeIds"],
      additionalProperties: false
    },
    run: async (input: unknown) => {
      const value = asRecord(input);
      const nodeIds = normalizeStringList(value.nodeIds);

      return {
        type: "figma_export_request",
        tool: "figma.export_nodes",
        fileKey: String(value.fileKey ?? ""),
        nodes: nodeIds.map((id) => ({
          id,
          status: "queued",
          artifactName: `figma-node-${sanitizeName(id)}.${String(value.format ?? "json")}`
        })),
        format: String(value.format ?? "json"),
        scale: Number(value.scale ?? 1),
        note: "当前工具只生成标准化导出请求；真实 Figma API 或 MCP server 应作为后续 tool provider 接入。"
      };
    }
  };
}

function createStitchTransformLayoutTool(root: string): Tool {
  return {
    name: "stitch.transform_layout",
    description: "把 Stitch layout JSON 转换为 Genesis UI 生成可用的结构化布局规格。",
    inputSchema: {
      type: "object",
      properties: {
        layoutPath: { type: "string", description: "Stitch layout JSON 相对路径。" },
        target: { type: "string", description: "转换后的目标页面名称。" }
      },
      additionalProperties: false
    },
    run: async (input: unknown) => {
      const value = asRecord(input);
      const layoutPath = typeof value.layoutPath === "string" ? value.layoutPath : defaultLayoutPath;
      const layout = await loadLayout(root, layoutPath);

      return {
        type: "stitch_layout_spec",
        tool: "stitch.transform_layout",
        target: String(value.target ?? layout.page ?? "Genesis 工作台"),
        source: layoutPath,
        regions: layout.regions ?? [],
        contracts: layout.contracts ?? {},
        dependencyBoundary: "Stitch JSON -> Tool output -> 可选前端实现"
      };
    }
  };
}

async function loadLayout(root: string, layoutPath: string): Promise<RecordInput> {
  const resolved = resolveInside(root, layoutPath);
  const raw = await fs.readFile(resolved, "utf8");
  return JSON.parse(raw) as RecordInput;
}

function resolveInside(root: string, requestedPath: string): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, requestedPath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error("路径越界，拒绝读取工作区外的设计资产。");
  }
  return resolved;
}

function asRecord(input: unknown): RecordInput {
  return input && typeof input === "object" ? input as RecordInput : {};
}


function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}
function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool } from "./types.ts";

export function createFilesystemTools(root = process.cwd()): Tool[] {
  return [
    {
      name: "list_files",
      description: "列出当前工作目录内的文件。",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对路径，默认当前目录。" },
          maxDepth: { type: "number", description: "递归深度，默认 1。" }
        },
        additionalProperties: false
      },
      run: async (input) => {
        const value = asRecord(input);
        const target = resolveInsideRoot(root, String(value.path ?? "."));
        const maxDepth = Number(value.maxDepth ?? 1);
        return listFiles(target, root, maxDepth);
      }
    },
    createReadFileTool(root, "filesystem.read"),
    createReadFileTool(root, "read_file"),
    {
      name: "write_file",
      description: "写入当前工作目录内的文本文件。",
      inputSchema: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string", description: "要写入的相对文件路径。" },
          content: { type: "string", description: "文件内容，默认语言应为中文。" }
        },
        additionalProperties: false
      },
      run: async (input) => {
        const value = asRecord(input);
        const target = resolveInsideRoot(root, String(value.path ?? ""));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, String(value.content ?? ""), "utf8");
        return { path: path.relative(root, target), status: "已写入" };
      }
    }
  ];
}

function createReadFileTool(root: string, name: string): Tool {
  return {
    name,
    description: name === "filesystem.read" ? "读取当前工作目录内的文本文件。" : "读取当前工作目录内的文本文件（兼容旧名称）。",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "要读取的相对文件路径。" }
      },
      additionalProperties: false
    },
    run: async (input) => {
      const value = asRecord(input);
      const target = resolveInsideRoot(root, String(value.path ?? ""));
      return fs.readFile(target, "utf8");
    }
  };
}

async function listFiles(target: string, root: string, maxDepth: number, depth = 0): Promise<string[]> {
  const entries = await fs.readdir(target, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") {
      continue;
    }

    const absolute = path.join(target, entry.name);
    const relative = path.relative(root, absolute);
    results.push(relative);

    if (entry.isDirectory() && depth < maxDepth) {
      results.push(...await listFiles(absolute, root, maxDepth, depth + 1));
    }
  }

  return results;
}

function resolveInsideRoot(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("文件路径超出当前工作目录，已拒绝访问。");
  }

  return resolved;
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

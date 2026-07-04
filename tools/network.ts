import type { Tool } from "./types.ts";

export function createNetworkTools(): Tool[] {
  return [
    {
      name: "http_get",
      description: "发起 HTTP GET 请求并返回文本结果。",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "请求 URL。" }
        },
        additionalProperties: false
      },
      run: async (input) => {
        const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
        const url = String(value.url ?? "");
        if (!/^https?:\/\//.test(url)) {
          throw new Error("URL 必须以 http:// 或 https:// 开头。");
        }
        const response = await fetch(url);
        return {
          status: response.status,
          body: await response.text()
        };
      }
    }
  ];
}


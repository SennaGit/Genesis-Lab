export const restEndpoints = [
  {
    method: "CLI",
    path: "genesis run \"idea\"",
    description: "Primary execution path for creating a Research DAG session and streaming runtime events."
  },
  {
    method: "CLI",
    path: "genesis status <session_id>",
    description: "Read session status, execution count, critic state, report path, and evidence map path."
  },
  {
    method: "CLI",
    path: "genesis report <session_id>",
    description: "Export the structured Markdown report from a completed session."
  },
  {
    method: "CLI",
    path: "genesis skills list | genesis mcp list",
    description: "Inspect reasoning policies and capability providers used by the runtime."
  },
  {
    method: "HTTP",
    path: "/api/runs/{runId}",
    description: "Compatibility API retained by the Python backend for existing workbench integrations."
  }
];

export const apiCapabilities = [
  {
    title: "Streaming events",
    description:
      "CLI runs emit plan, node_start, tool_result, critic_result, replan, and final_report events."
  },
  {
    title: "MCP tool boundary",
    description:
      "Local tools, configured mock tools, and stdio MCP server tools use one MCPTool interface."
  },
  {
    title: "Model routing",
    description:
      "Planning, execution, critic, and synthesis roles can use different OpenAI, Anthropic, custom, or local models."
  }
];

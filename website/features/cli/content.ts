import type { TerminalEntry } from "@/ui/components/terminal";

export const cliCommands: TerminalEntry[] = [
  {
    command: "genesis init",
    response: ["Creates ~/.genesis/config.json, ~/.genesis/mcp.json, and the session store."]
  },
  {
    command: "genesis run \"quantum memory stability in LLMs\"",
    response: [
      "Streams plan, node_start, tool_result, critic_result, replan, and final_report events while persisting a session."
    ]
  },
  {
    command: "genesis status <session_id>",
    response: ["Prints session status, DAG node count, execution count, critic state, report path, and evidence map path."]
  },
  {
    command: "genesis report <session_id> --path",
    response: ["Prints the Markdown report path; omit --path to print the report body."]
  },
  {
    command: "genesis skills list && genesis mcp list",
    response: ["Shows reasoning policies and configured MCP/local tools available to the Research Runtime."]
  }
];

export const cliPanels = [
  {
    title: "Start a session",
    description:
      "Use genesis run to turn an idea into a persisted Research DAG with evidence and critic state."
  },
  {
    title: "Resume or inspect",
    description:
      "Use genesis resume, status, and report to continue unfinished work or inspect completed artifacts."
  },
  {
    title: "Extend capabilities",
    description:
      "Use skills and MCP commands to inspect reasoning policies and tool providers without changing the runtime loop."
  }
];

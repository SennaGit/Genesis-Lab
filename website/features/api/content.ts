export const restEndpoints = [
  {
    method: "POST",
    path: "/api/research/compile",
    description: "Compile a natural-language research question into a structured research task."
  },
  {
    method: "POST",
    path: "/api/runs",
    description: "Create a complete run that moves through planning, execution, evidence, and synthesis."
  },
  {
    method: "GET",
    path: "/api/runs/{runId}",
    description: "Read run status, DAG nodes, logs, timestamps, and current execution state."
  },
  {
    method: "GET",
    path: "/api/runs/{runId}/evidence",
    description: "Fetch evidence items produced by literature, code, synthesis, and review stages."
  },
  {
    method: "GET",
    path: "/api/runs/{runId}/report",
    description: "Export the generated Markdown report for a completed or reviewed run."
  }
];

export const apiCapabilities = [
  {
    title: "Streaming",
    description:
      "Run events can be streamed to clients so long-running research tasks show progress, logs, and agent milestones as they happen."
  },
  {
    title: "Tool calling",
    description:
      "Agents can call tools through a controlled interface while the runtime records the tool name, result, and evidence linkage."
  },
  {
    title: "Plugin system",
    description:
      "Providers, tools, and artifact builders can be attached as plugins without coupling the research engine to one vendor or model."
  }
];

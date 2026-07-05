export const philosophyItems = [
  {
    title: "Research-first runtime",
    description:
      "Genesis starts from a user idea and builds a Research DAG, rather than treating repositories, issues, or CI as the product workflow."
  },
  {
    title: "Evidence before synthesis",
    description:
      "Planner, Executor, Critic, Replanner, and Synthesizer are separate responsibilities so claims remain traceable to evidence and review state."
  },
  {
    title: "User-owned providers",
    description:
      "OpenAI, Anthropic, custom OpenAI-compatible, and local endpoints are configured by the user and routed by model role."
  }
];

export const architectureLayers = [
  {
    name: "CLI Layer",
    detail:
      "Entry point for genesis init, run, chat, resume, status, report, skills, mcp, config, and doctor commands."
  },
  {
    name: "Runtime Core",
    detail:
      "Runs Planner -> Research DAG -> Executor -> Critic -> Replanner -> Synthesizer with streaming events and session persistence."
  },
  {
    name: "Research DAG",
    detail:
      "Represents hypotheses, questions, experiments, analyses, and synthesis nodes with dependencies, tools, skills, and success criteria."
  },
  {
    name: "Skills and MCP",
    detail:
      "Skills define reasoning policies; MCP and local tools provide external capabilities without owning the workflow."
  },
  {
    name: "Memory and Artifacts",
    detail:
      "Stores graph.json, execution_log.json, critic_rounds.json, graph_revisions.json, report.md, and artifacts/evidence_map.json per session."
  }
];

export const workflowSteps = [
  {
    name: "Plan",
    description:
      "Convert the idea into a schema-checked Research DAG and select relevant skills and tools."
  },
  {
    name: "Execute",
    description:
      "Run DAG nodes through local tools, MCP servers, providers, or runtime capabilities while recording evidence."
  },
  {
    name: "Critic",
    description:
      "Detect low confidence, missing evidence, contradictions, and tool failures, then produce revision actions."
  },
  {
    name: "Replan",
    description:
      "Append targeted DAG nodes from critic actions and re-execute within the configured refinement limit."
  },
  {
    name: "Synthesize",
    description:
      "Write a structured report with research plan, findings, experiments, limitations, conclusion, evidence map, and artifacts."
  }
];

export const communityModel = [
  {
    title: "Contribution model",
    description:
      "Contributions should preserve the boundary between CLI, runtime, skills, MCP providers, memory, and compatibility APIs."
  },
  {
    title: "Review culture",
    description:
      "Changes are easiest to review when they include runtime behavior, evidence handling, failure modes, and focused tests."
  },
  {
    title: "Extension points",
    description:
      "The project welcomes provider adapters, MCP servers, skill packs, DAG scheduling improvements, and artifact exporters."
  }
];

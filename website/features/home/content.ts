export const hero = {
  title: "Genesis Lab",
  headline: "CLI Research Runtime OS",
  subtitle: "Planner -> Research DAG -> Executor -> Critic -> Replanner -> Synthesizer"
};

export const heroSignals = [
  { label: "DAG", value: "research" },
  { label: "Runtime", value: "CLI-first" },
  { label: "Tools", value: "MCP-ready" }
];

export const capabilityCards = [
  {
    title: "Idea-driven planning",
    description:
      "Turn a research idea into a schema-checked Research DAG with hypotheses, questions, experiments, analysis, and synthesis nodes."
  },
  {
    title: "Critic-driven refinement",
    description:
      "Evaluate confidence, missing evidence, contradictions, and tool failures before replanning or writing final conclusions."
  },
  {
    title: "Skills and MCP capabilities",
    description:
      "Route work through modular reasoning policies and local or stdio MCP tools while keeping GitHub as a capability provider only."
  }
];

export const workbenchFrames = [
  {
    title: "Research DAG",
    body: "Planner emits schema-checked nodes with dependencies, tools_required, skills_required, and success criteria."
  },
  {
    title: "Session memory",
    body: "Each session stores graph, execution log, critic rounds, graph revisions, report, and evidence map."
  },
  {
    title: "Review loop",
    body: "Critic produces issues and revision actions that can trigger bounded replanning before synthesis."
  }
];

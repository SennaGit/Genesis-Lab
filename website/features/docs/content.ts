export const philosophyItems = [
  {
    title: "Auditable AI workflow",
    description:
      "Every run keeps a visible chain from the original question to the task graph, evidence entries, computation output, review notes, and final artifact."
  },
  {
    title: "Modular research pipeline",
    description:
      "Literature search, hypothesis framing, execution, validation, and artifact generation are separate modules that can be inspected or replaced."
  },
  {
    title: "Human-in-the-loop reasoning system",
    description:
      "Researchers approve assumptions, inspect model behavior, correct intermediate claims, and decide when evidence is strong enough to publish."
  }
];

export const architectureLayers = [
  {
    name: "CLI Layer",
    detail:
      "Entry point for genesis run, genesis compile, genesis status, and genesis report commands."
  },
  {
    name: "Agent Layer",
    detail:
      "Coordinates literature, code, synthesis, and review agents while preserving run state and evidence references."
  },
  {
    name: "Research Engine",
    detail:
      "Compiles questions into structured tasks, validates graph dependencies, and schedules the research DAG."
  },
  {
    name: "Compute Layer",
    detail:
      "Executes code, evaluates outputs, records logs, and connects computed results to validation checkpoints."
  },
  {
    name: "Artifact Builder",
    detail:
      "Assembles reports, evidence ledgers, and exportable outputs that remain connected to the run history."
  }
];

export const workflowSteps = [
  {
    name: "Literature",
    description:
      "Collect source context and evidence candidates before the system forms a computational path."
  },
  {
    name: "Hypothesis",
    description:
      "Convert the research question into testable assumptions, expected signals, and review checkpoints."
  },
  {
    name: "Compute",
    description:
      "Run local code or tools against the planned task graph and preserve outputs as evidence items."
  },
  {
    name: "Validation",
    description:
      "Compare results against assumptions, flag weak claims, and keep the researcher in control of acceptance."
  },
  {
    name: "Artifact",
    description:
      "Generate a report or research package with traceable links back to the reasoning and computation."
  }
];

export const communityModel = [
  {
    title: "Contribution model",
    description:
      "Contributions should preserve the research boundary between routing, content modules, reusable UI, agent runtime, and provider integrations."
  },
  {
    title: "Review culture",
    description:
      "Changes are easiest to review when they include clear run behavior, evidence handling, failure modes, and focused tests."
  },
  {
    title: "Extension points",
    description:
      "The project welcomes provider adapters, agent improvements, workflow visualizations, and artifact export paths."
  }
];

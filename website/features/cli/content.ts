import type { TerminalEntry } from "@/ui/components/terminal";

export const cliCommands: TerminalEntry[] = [
  {
    command: "genesis run \"why does quantum entanglement not violate relativity\"",
    response: [
      "Runs the complete Genesis workflow, saves the run snapshot, records evidence, and writes a Markdown report."
    ]
  },
  {
    command: "genesis compile \"why does quantum entanglement not violate relativity\"",
    response: [
      "Compiles the question into a ResearchTask and DAG without executing the full workflow."
    ]
  },
  {
    command: "genesis status <runId>",
    response: [
      "Prints saved run status, question, timestamps, evidence count, report path, node states, and logs."
    ]
  },
  {
    command: "genesis report <runId>",
    response: [
      "Prints the saved Markdown report for a completed run. Use genesis report <runId> --path for the file path."
    ]
  }
];

export const cliPanels = [
  {
    title: "Run the workflow",
    description:
      "Use genesis run to execute the local research workflow and persist a traceable run record."
  },
  {
    title: "Compile before execution",
    description:
      "Use genesis compile to inspect the generated research task and DAG before committing to execution."
  },
  {
    title: "Inspect saved outputs",
    description:
      "Use genesis status and genesis report to review saved run state, logs, evidence count, and Markdown output."
  }
];
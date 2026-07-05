import type { ResearchRun } from "@/types/research.types";

export const initialQuestion = "quantum memory stability in LLMs";

export const exampleRun: ResearchRun = {
  id: "preview-session",
  question: initialQuestion,
  status: "idle",
  task: {
    question: initialQuestion,
    domains: ["research-runtime"],
    subQuestions: [
      { id: 1, text: "What hypothesis should be tested?", requires: [] },
      { id: 2, text: "What evidence is needed?", requires: [1] }
    ],
    hypotheses: ["The idea can be decomposed into a bounded Research DAG."],
    methods: ["Planner", "Executor", "Critic", "Replanner", "Synthesizer"]
  },
  dag: [
    {
      id: "n1",
      type: "hypothesis",
      status: "pending",
      requires: [],
      agent: "Planner",
      outputs: {},
      attempts: 0,
      error: null
    },
    {
      id: "n2",
      type: "question",
      status: "pending",
      requires: ["n1"],
      agent: "Executor",
      outputs: {},
      attempts: 0,
      error: null
    },
    {
      id: "n3",
      type: "analysis",
      status: "pending",
      requires: ["n2"],
      agent: "Critic",
      outputs: {},
      attempts: 0,
      error: null
    },
    {
      id: "n4",
      type: "synthesis",
      status: "pending",
      requires: ["n3"],
      agent: "Synthesizer",
      outputs: {},
      attempts: 0,
      error: null
    }
  ],
  logs: ["Waiting for a research idea."],
  artifacts: [],
  report: null,
  createdAt: "",
  updatedAt: ""
};

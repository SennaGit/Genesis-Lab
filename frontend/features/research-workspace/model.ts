import type { ResearchRun } from "@/types/research.types";

export const initialQuestion = "为什么量子纠缠不违反相对论？";

export const exampleRun: ResearchRun = {
  id: "preview",
  question: initialQuestion,
  status: "idle",
  task: {
    question: initialQuestion,
    domains: [],
    subQuestions: [],
    hypotheses: [],
    methods: []
  },
  dag: [
    {
      id: "literature-1",
      type: "literature_search",
      status: "pending",
      requires: [],
      agent: "LiteratureAgent",
      outputs: {},
      attempts: 0,
      error: null
    },
    {
      id: "analysis-1",
      type: "python_analysis",
      status: "pending",
      requires: ["literature-1"],
      agent: "CodeAgent",
      outputs: {},
      attempts: 0,
      error: null
    },
    {
      id: "synthesis-1",
      type: "report_synthesis",
      status: "pending",
      requires: ["analysis-1"],
      agent: "SynthesisAgent",
      outputs: {},
      attempts: 0,
      error: null
    },
    {
      id: "review-1",
      type: "self_review",
      status: "pending",
      requires: ["synthesis-1"],
      agent: "ReviewAgent",
      outputs: {},
      attempts: 0,
      error: null
    }
  ],
  logs: ["等待输入研究问题。"],
  artifacts: [],
  report: null,
  createdAt: "",
  updatedAt: ""
};

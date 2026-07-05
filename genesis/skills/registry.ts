import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MCPTool, ModelRole, Skill } from "../types/research.ts";

export type SkillAuditIssue = {
  skill_id: string;
  severity: "warning" | "error";
  message: string;
};

const LEGACY_TOOL_ALIASES: Record<string, string[]> = {
  "python.sandbox": ["runtime.python"],
  "literature.local_search": ["literature.search"],
  "mcp.call": ["browser.validate"]
};

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();
  private readonly aliases = new Map<string, string>();

  constructor(initialSkills: Skill[] = defaultSkills(), options: { skillRoot?: string; loadDirectory?: boolean } = {}) {
    for (const skill of initialSkills) {
      this.register(skill);
    }
    if (options.loadDirectory ?? true) {
      for (const skill of loadSkillsFromDirectory(options.skillRoot ?? defaultSkillRoot())) {
        this.register(skill);
      }
    }
  }

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
    this.aliases.set(skill.name, skill.id);
  }

  get(name: string): Skill {
    const id = this.skills.has(name) ? name : this.aliases.get(name);
    const skill = id ? this.skills.get(id) : undefined;
    if (!skill) {
      throw new Error(`Unknown skill: ${name}`);
    }
    return skill;
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  audit(availableTools: Iterable<string | MCPTool> = []): SkillAuditIssue[] {
    const toolNames = new Set(Array.from(availableTools, (tool) => typeof tool === "string" ? tool : tool.name));
    const issues: SkillAuditIssue[] = [];
    for (const skill of this.list()) {
      if (!skill.system_prompt.trim()) {
        issues.push({ skill_id: skill.id, severity: "error", message: "system_prompt is empty." });
      }
      if (!skill.workflow.length) {
        issues.push({ skill_id: skill.id, severity: "warning", message: "workflow is empty." });
      }
      for (const tool of [...skill.required_tools, ...skill.tool_policy.allowed_tools]) {
        if (LEGACY_TOOL_ALIASES[tool]) {
          issues.push({ skill_id: skill.id, severity: "error", message: `legacy tool alias remains: ${tool}` });
        }
        if (toolNames.size > 0 && !toolNames.has(tool) && !tool.endsWith(".*")) {
          issues.push({ skill_id: skill.id, severity: "warning", message: `tool is not registered by default MCP registry: ${tool}` });
        }
      }
    }
    return issues;
  }

  selectForIdea(idea: string): Skill[] {
    const q = idea.toLowerCase();
    const tokens = q.split(/[^a-z0-9_]+/).filter((token) => token.length > 3);
    const selected = this.list().filter((skill) => {
      const haystack = [skill.id, skill.name, skill.description, skill.system_prompt, ...skill.triggers, ...skill.workflow].join(" ").toLowerCase();
      return skill.triggers.some((trigger) => q.includes(trigger.toLowerCase())) || tokens.some((token) => haystack.includes(token));
    });
    return selected.length ? selected : [this.get("research_skill")];
  }
}

export function loadSkillsFromDirectory(root = defaultSkillRoot()): Skill[] {
  if (!existsSync(root)) {
    return [];
  }
  const skills: Skill[] = [];
  for (const entry of readdirSync(root)) {
    const dir = path.join(root, entry);
    if (!statSync(dir).isDirectory()) {
      continue;
    }
    const specPath = path.join(dir, "skill.json");
    if (!existsSync(specPath)) {
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(specPath, "utf8")) as Record<string, unknown>;
      const promptPath = path.join(dir, "prompt.md");
      const prompt = existsSync(promptPath) ? readFileSync(promptPath, "utf8").trim() : String(raw.system_prompt ?? raw.description ?? "");
      skills.push(normalizeSkillSpec(raw, prompt));
    } catch {
      continue;
    }
  }
  return skills;
}

function normalizeSkillSpec(raw: Record<string, unknown>, prompt: string): Skill {
  const id = stringValue(raw.id, stringValue(raw.name, "unknown_skill")).replace(/\s+/g, "_");
  const requiredTools = canonicalToolList(stringArray(raw.required_tools));
  const workflow = stringArray(raw.workflow, stringArray(raw.triggers));
  return {
    id,
    name: stringValue(raw.name, id).replace(/\s+/g, "_"),
    description: stringValue(raw.description, prompt || id),
    triggers: stringArray(raw.triggers),
    input_schema: raw.input_schema ?? { type: "object" },
    output_schema: raw.output_schema ?? { type: "object" },
    required_tools: requiredTools,
    default_model_role: normalizeModelRole(stringValue(raw.default_model_role, "execution")),
    system_prompt: prompt || stringValue(raw.system_prompt, stringValue(raw.description, id)),
    tool_policy: normalizeToolPolicy(raw.tool_policy, requiredTools),
    workflow
  };
}

function normalizeToolPolicy(value: unknown, requiredTools: string[]): Skill["tool_policy"] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      allowed_tools: canonicalToolList(stringArray(record.allowed_tools, requiredTools)),
      disallowed_tools: canonicalToolList(stringArray(record.disallowed_tools))
    };
  }
  return {
    allowed_tools: requiredTools.length ? requiredTools : ["literature.search", "browser.validate"],
    disallowed_tools: []
  };
}

function canonicalToolList(tools: string[]): string[] {
  return Array.from(new Set(tools.flatMap((tool) => LEGACY_TOOL_ALIASES[tool] ?? [tool])));
}
function normalizeModelRole(value: string): ModelRole {
  if (value === "planner") {
    return "planning";
  }
  if (value === "executor") {
    return "execution";
  }
  if (value === "planning" || value === "execution" || value === "critic" || value === "synthesizer") {
    return value;
  }
  return "execution";
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

export function defaultSkillRoot(): string {
  return process.env.GENESIS_SKILLS_DIR || path.join(process.env.GENESIS_HOME || path.join(os.homedir(), ".genesis"), "skills");
}

export function defaultSkills(): Skill[] {
  return [
    {
      id: "research_skill",
      name: "research_skill",
      description: "Plan and execute source-grounded scientific research with explicit evidence.",
      triggers: ["research", "evidence", "hypothesis", "study", "literature"],
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      required_tools: ["literature.search", "browser.validate", "dataset.lookup"],
      default_model_role: "planning",
      system_prompt: "Plan and execute source-grounded scientific research with explicit evidence.",
      tool_policy: {
        allowed_tools: ["literature.search", "browser.validate", "dataset.lookup", "github.repo_exploration"],
        disallowed_tools: ["github.change_execution"]
      },
      workflow: ["decompose idea", "collect evidence", "map evidence to claims", "synthesize report"]
    },
    {
      id: "paper_analysis_skill",
      name: "paper_analysis_skill",
      description: "Analyze papers, methods, claims, limitations, and citation support.",
      triggers: ["paper", "citation", "doi", "pdf", "literature"],
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      required_tools: ["literature.search", "browser.validate", "dataset.lookup"],
      default_model_role: "execution",
      system_prompt: "Analyze papers, methods, claims, limitations, and citation support.",
      tool_policy: {
        allowed_tools: ["literature.search", "browser.validate", "dataset.lookup"],
        disallowed_tools: ["github.change_execution"]
      },
      workflow: ["identify claims", "inspect methods", "extract evidence", "flag limitations"]
    },
    {
      id: "coding_skill",
      name: "coding_skill",
      description: "Use code execution as a research instrument, not as automation workflow.",
      triggers: ["code", "repo", "github", "experiment", "simulate", "python"],
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      required_tools: ["runtime.python", "github.code_understanding", "github.repo_exploration"],
      default_model_role: "execution",
      system_prompt: "Use code execution as a research instrument, not as automation workflow.",
      tool_policy: {
        allowed_tools: ["runtime.python", "github.code_understanding", "github.repo_exploration", "dataset.lookup"],
        disallowed_tools: []
      },
      workflow: ["inspect code", "design experiment", "run minimal reproducible analysis", "record artifacts"]
    },
    {
      id: "debugging_skill",
      name: "debugging_skill",
      description: "Diagnose failures as evidence for research hypotheses.",
      triggers: ["debug", "failure", "ci", "bug", "trace"],
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      required_tools: ["github.ci_diagnosis", "github.code_understanding", "runtime.python"],
      default_model_role: "critic",
      system_prompt: "Diagnose failures as evidence for research hypotheses.",
      tool_policy: {
        allowed_tools: ["github.ci_diagnosis", "github.code_understanding", "runtime.python", "browser.validate"],
        disallowed_tools: ["github.change_execution"]
      },
      workflow: ["debug github ci", "collect logs", "classify failure", "test hypothesis", "summarize contradiction"]
    }
  ];
}

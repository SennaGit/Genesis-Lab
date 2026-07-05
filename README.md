# Genesis Lab

Genesis Lab is a CLI-first Research Runtime OS for idea-driven scientific work. The TypeScript runtime is now the main execution path; the Python backend remains as a compatibility/API layer.

## Core Model

Genesis runs a research loop instead of a GitHub automation workflow:

```text
Planner -> Research DAG -> Executor -> Critic -> Replanner -> Synthesizer
```

GitHub is only a capability provider through MCP-style tools. It does not define the product workflow.

## CLI

```bash
genesis init
genesis run "quantum memory stability in LLMs"
genesis chat
genesis resume <session_id> [--continue]
genesis status <session_id>
genesis report <session_id> [--path]
genesis skills list
genesis skills inspect research_skill
genesis mcp list
genesis mcp test literature.search
genesis config show
genesis doctor
```

The Node entrypoint is `bin/genesis.ts`, which loads the TypeScript runtime in `genesis/cli/main.ts`.

## Local State

Genesis stores runtime state under `~/.genesis` by default. Set `GENESIS_HOME` to override it.

```text
~/.genesis/
  config.json
  mcp.json
  sessions/<session_id>/
    graph.json
    execution_log.json
    critic_rounds.json
    graph_revisions.json
    report.md
    artifacts/evidence_map.json
```

## Provider Configuration

`~/.genesis/config.json` supports mock, OpenAI, Anthropic, OpenAI-compatible/custom, and local OpenAI-compatible endpoints.

```json
{
  "provider": "openai",
  "apiKey": "",
  "baseURL": "",
  "model": "gpt-4.1",
  "models": {
    "planning": "gpt-4.1",
    "execution": "gpt-4.1-mini",
    "critic": "gpt-4.1",
    "synthesizer": "gpt-4.1-mini"
  },
  "thresholds": {
    "confidence": 0.65,
    "max_replans": 1
  }
}
```

CLI output redacts API keys. Runtime logs and reports do not write API keys.

## Skills

Skills are modular reasoning policies. The directory format is:

```text
skills/<skill_id>/
  skill.json
  prompt.md
```

Required built-in skills are available as directory assets and runtime defaults:

- `research_skill`
- `paper_analysis_skill`
- `coding_skill`
- `debugging_skill`

## MCP Tools

`~/.genesis/mcp.json` can declare external tool boundaries. The runtime also registers default mock tools for local deterministic tests:

- `literature.search`
- `browser.validate`
- `dataset.lookup`
- `runtime.python`
- `github.code_understanding`
- `github.repo_exploration`
- `github.ci_diagnosis`
- `github.change_execution`

GitHub tools are capabilities only; workflow/bot semantics are rejected.

## Development Checks

```bash
node --test tests/*.test.ts
node frontend/node_modules/typescript/bin/tsc -p tsconfig.agent.json
python -m unittest discover -s backend/tests
```

## Compatibility Layer

The Python backend under `backend/` is retained for historical tests and API compatibility. New CLI execution should use `genesis run`; the legacy Python CLI module is compatibility-only.


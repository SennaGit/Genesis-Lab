import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentResult, AgentState, Observation, ToolCall } from "../core/types.ts";
import { appendRun, loadSessionState, saveSessionState } from "../providers/config.ts";

test("appendRun migrates legacy toolTrace runs and writes trace-only records", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-persistence-run-"));
  const genesisHome = path.join(temp, ".genesis");
  process.env.GENESIS_HOME = genesisHome;
  await mkdir(genesisHome, { recursive: true });
  const legacyToolCall: ToolCall = {
    id: "legacy-call",
    name: "list_files",
    input: { path: "." }
  };
  const legacyObservation: Observation = {
    toolCallId: "legacy-call",
    toolName: "list_files",
    output: ["README.md"]
  };
  const nextToolCall: ToolCall = {
    id: "next-call",
    name: "read_file",
    input: { path: "README.md" }
  };
  const nextObservation: Observation = {
    toolCallId: "next-call",
    toolName: "read_file",
    output: "ok"
  };

  try {
    await writeFile(
      path.join(genesisHome, "state.json"),
      JSON.stringify({
        runs: [
          {
            at: "2026-01-01T00:00:00.000Z",
            output: "legacy output",
            steps: 1,
            toolTrace: [legacyToolCall],
            observations: [legacyObservation]
          }
        ],
        sessions: {}
      }),
      "utf8"
    );

    await appendRun(createResult(nextToolCall, nextObservation));

    const persisted = JSON.parse(await readFile(path.join(genesisHome, "state.json"), "utf8"));
    assert.equal(persisted.runs.length, 2);
    assert.deepEqual(persisted.runs[0].trace, [legacyToolCall, legacyObservation]);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.runs[0], "toolTrace"), false);
    assert.deepEqual(persisted.runs[1].trace, [nextToolCall, nextObservation]);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.runs[1], "toolTrace"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("session state loads legacy toolTrace and trace-only snapshots, then saves trace format", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-persistence-session-"));
  const genesisHome = path.join(temp, ".genesis");
  process.env.GENESIS_HOME = genesisHome;
  await mkdir(genesisHome, { recursive: true });
  const legacyToolCall: ToolCall = {
    id: "legacy-session-call",
    name: "list_files",
    input: { path: "." }
  };
  const legacyObservation: Observation = {
    toolCallId: "legacy-session-call",
    toolName: "list_files",
    output: ["README.md"]
  };
  const traceToolCall: ToolCall = {
    id: "trace-session-call",
    name: "read_file",
    input: { path: "README.md" }
  };
  const traceObservation: Observation = {
    toolCallId: "trace-session-call",
    toolName: "read_file",
    output: "ok"
  };

  try {
    await writeFile(
      path.join(genesisHome, "state.json"),
      JSON.stringify({
        runs: [],
        sessions: {
          legacy: {
            messages: [],
            scratchpad: "legacy",
            toolTrace: [legacyToolCall],
            observations: [legacyObservation],
            done: false,
            steps: 1
          },
          traceOnly: {
            messages: [],
            scratchpad: "trace",
            trace: [traceToolCall, traceObservation],
            final: "done",
            done: true,
            steps: 2
          }
        }
      }),
      "utf8"
    );

    const legacy = await loadSessionState("legacy");
    const traceOnly = await loadSessionState("traceOnly");

    assert.ok(legacy);
    assert.deepEqual(legacy.toolCalls, [legacyToolCall]);
    assert.deepEqual(legacy.observations, [legacyObservation]);
    assert.equal(Object.prototype.hasOwnProperty.call(legacy, "toolTrace"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(legacy, "trace"), false);

    assert.ok(traceOnly);
    assert.deepEqual(traceOnly.toolCalls, [traceToolCall]);
    assert.deepEqual(traceOnly.observations, [traceObservation]);
    assert.equal(traceOnly.final, "done");

    await saveSessionState("legacy", legacy);

    const persisted = JSON.parse(await readFile(path.join(genesisHome, "state.json"), "utf8"));
    assert.deepEqual(persisted.sessions.legacy.trace, [legacyToolCall, legacyObservation]);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.sessions.legacy, "toolTrace"), false);
    assert.deepEqual(persisted.sessions.traceOnly.trace, [traceToolCall, traceObservation]);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.sessions.traceOnly, "toolTrace"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function createResult(toolCall: ToolCall, observation: Observation): AgentResult {
  const state: AgentState = {
    messages: [],
    scratchpad: "",
    toolCalls: [toolCall],
    observations: [observation],
    final: "done",
    done: true,
    steps: 1
  };

  return {
    output: "done",
    trace: [toolCall, observation],
    steps: 1,
    toolTrace: [toolCall],
    observations: [observation],
    state
  };
}

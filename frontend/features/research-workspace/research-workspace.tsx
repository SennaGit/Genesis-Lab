"use client";

import { useMemo, useState } from "react";
import { Beaker, FileText, Network, Play, Search } from "lucide-react";
import { Button } from "@/ui/components/button";
import { DagNodeCard } from "@/ui/components/dag-node-card";
import { EvidenceCard } from "@/ui/components/evidence-card";
import { Panel } from "@/ui/components/panel";
import { WorkspaceShell } from "@/ui/layouts/workspace-shell";
import type { EvidenceItem, ResearchRun } from "@/types/research.types";
import {
  createResearchRun,
  getResearchEvidence,
  getResearchReport,
  getResearchRun
} from "@/services/research.service";
import { exampleRun, initialQuestion } from "./model";

export function ResearchWorkspace() {
  const [question, setQuestion] = useState(initialQuestion);
  const [run, setRun] = useState<ResearchRun>(exampleRun);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);

  const completedCount = useMemo(
    () => run.dag.filter((node) => node.status === "completed").length,
    [run.dag]
  );

  async function startRun() {
    setBusy(true);
    setMarkdown("");

    try {
      const created = await createResearchRun(question);
      const [runData, evidenceData, reportData] = await Promise.all([
        getResearchRun(created.runId),
        getResearchEvidence(created.runId),
        getResearchReport(created.runId)
      ]);

      setRun(runData);
      setEvidence(evidenceData.items);
      setMarkdown(reportData.markdown);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setRun({
        ...exampleRun,
        status: "error",
        logs: [message],
        updatedAt: new Date().toISOString()
      });
      setEvidence([]);
    } finally {
      setBusy(false);
    }
  }

  const sidebar = (
    <>
      <div className="brand-lockup">
        <span className="brand-lockup__icon">
          <Beaker size={24} aria-hidden="true" />
        </span>
        <div>
          <h1>Genesis Lab</h1>
          <p>AI 科研工作流实验室</p>
        </div>
      </div>

      <form className="question-form" onSubmit={(event) => {
        event.preventDefault();
        void startRun();
      }}>
        <label>
          <span>研究问题</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="研究问题"
          />
        </label>
        <Button
          disabled={busy}
          fullWidth
          icon={<Play size={18} aria-hidden="true" />}
          label={busy ? "运行中" : "启动研究流"}
          type="submit"
        />
      </form>

      <div className="sidebar-section-gap" />

      <Panel
        action={<span className="progress-text">已完成 {completedCount}/{run.dag.length}</span>}
        icon={<Network size={18} aria-hidden="true" />}
        title="DAG"
      >
        <div className="dag-list">
          {run.dag.map((node) => (
            <DagNodeCard key={node.id} node={node} />
          ))}
        </div>
      </Panel>
    </>
  );

  const main = (
    <>
      <div className="workspace-header">
        <div>
          <h2>执行日志与报告</h2>
          <p>状态：{run.status}</p>
        </div>
        <span className="status-pill">运行 {run.id}</span>
      </div>

      <Panel padded scroll>
        <div className="log-list">
          {run.logs.map((log, index) => (
            <div className="log-line" key={`${log}-${index}`}>{log}</div>
          ))}
        </div>
      </Panel>

      <Panel icon={<FileText size={18} aria-hidden="true" />} title="Markdown 报告" scroll>
        <pre className="report-text">
          {markdown || "报告会在运行结束后显示。"}
        </pre>
      </Panel>
    </>
  );

  const evidencePanel = (
    <>
      <Panel icon={<Search size={18} aria-hidden="true" />} title="证据面板" padded={false}>
        {evidence.length === 0 ? (
          <p className="empty-state">暂无证据。</p>
        ) : (
          <div className="evidence-list">
            {evidence.map((item) => (
              <EvidenceCard item={item} key={item.id} />
            ))}
          </div>
        )}
      </Panel>
    </>
  );

  return <WorkspaceShell evidence={evidencePanel} main={main} sidebar={sidebar} />;
}

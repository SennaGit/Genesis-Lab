import type { WorkspaceShellContract } from "@/ui/contracts/workspace.contracts";

export function WorkspaceShell({ sidebar, main, evidence }: WorkspaceShellContract) {
  return (
    <main className="workspace-shell">
      <aside className="workspace-shell__sidebar">{sidebar}</aside>
      <section className="workspace-shell__main">{main}</section>
      <aside className="workspace-shell__evidence">{evidence}</aside>
    </main>
  );
}

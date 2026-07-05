export const GITHUB_CAPABILITIES = {
  "github.code_understanding": ["fetch_pr", "get_pr_diff", "read_file"],
  "github.repo_exploration": ["search_repositories", "search_issues", "search_prs"],
  "github.ci_diagnosis": ["fetch_workflow_run_jobs", "fetch_workflow_logs"],
  "github.change_execution": ["create_branch", "update_file", "create_pr", "update_issue"]
} as const;

export function assertGitHubIsCapabilityOnly(toolName: string): void {
  if (/workflow|bot|automation/i.test(toolName)) {
    throw new Error("GitHub workflow/bot semantics are not allowed in Genesis Research Runtime.");
  }
}

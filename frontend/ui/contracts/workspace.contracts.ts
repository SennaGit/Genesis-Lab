import type { ReactNode } from "react";
import type { DagNode, EvidenceItem } from "@/types/research.types";

export type ButtonContract = {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  type?: "button" | "submit";
};

export type PanelContract = {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  scroll?: boolean;
};

export type WorkspaceShellContract = {
  sidebar: ReactNode;
  main: ReactNode;
  evidence: ReactNode;
};

export type DagNodeContract = {
  node: Pick<DagNode, "id" | "agent" | "status">;
};

export type EvidenceItemContract = {
  item: Pick<EvidenceItem, "sourceId" | "sourceType" | "snippet">;
};

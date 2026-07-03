import type { ButtonContract } from "@/ui/contracts/workspace.contracts";

export function Button({
  label,
  onClick,
  variant = "primary",
  disabled = false,
  fullWidth = false,
  icon,
  type = "button"
}: ButtonContract) {
  const className = [
    "button",
    `button--${variant}`,
    fullWidth ? "button--full" : ""
  ].filter(Boolean).join(" ");

  return (
    <button className={className} disabled={disabled} onClick={onClick} type={type}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

import type { PanelContract } from "@/ui/contracts/workspace.contracts";

export function Panel({
  title,
  icon,
  action,
  children,
  padded = true,
  scroll = false
}: PanelContract) {
  const className = [
    "panel",
    padded ? "panel--padded" : "",
    scroll ? "panel--scroll" : ""
  ].filter(Boolean).join(" ");

  return (
    <section className={className}>
      {(title || action) && (
        <div className="panel__header">
          {title ? (
            <div className="panel__title">
              {icon}
              <span>{title}</span>
            </div>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

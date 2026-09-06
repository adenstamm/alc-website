import ChevronIcon from "./ChevronIcon";

export default function AdminPanel({
  children,
  eyebrow,
  id,
  isOpen,
  onToggle,
  summary,
  title,
}) {
  const bodyId = `${id}-body`;

  return (
    <section
      className={`admin-workspace-panel ${isOpen ? "is-open" : ""}`}
      id={id}
    >
      <button
        aria-controls={bodyId}
        aria-expanded={isOpen}
        className="admin-panel-trigger"
        type="button"
        onClick={onToggle}
      >
        <span className="admin-panel-index">{eyebrow}</span>
        <span className="admin-panel-heading">
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <ChevronIcon isOpen={isOpen} />
      </button>
      <div aria-hidden={!isOpen} className="admin-panel-reveal" id={bodyId}>
        <div
          className="admin-panel-reveal-inner"
          inert={!isOpen ? true : undefined}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

export default function ChevronIcon({ isOpen }) {
  return (
    <svg
      aria-hidden="true"
      className={isOpen ? "is-open" : ""}
      viewBox="0 0 20 20"
    >
      <path
        d="m5 7.5 5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

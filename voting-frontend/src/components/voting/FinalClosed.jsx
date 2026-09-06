import { formatTimestamp } from "../../lib/ballotState.js";

export default function FinalClosed({ finalClosedAt, finalClosesAt }) {
  const cutoff = finalClosedAt || finalClosesAt;

  return (
    <div className="confirmation-card">
      <p className="eyebrow">Final voting closed</p>
      <h3>The final ballot is locked.</h3>
      <p>
        No new rankings can be submitted. The admin can now finalize any tied
        elimination round and publish the official winner.
      </p>
      {cutoff ? (
        <p className="timestamp">Closed {formatTimestamp(cutoff)}</p>
      ) : null}
    </div>
  );
}

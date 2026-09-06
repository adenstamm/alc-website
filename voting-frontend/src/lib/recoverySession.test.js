import assert from "node:assert/strict";
import test from "node:test";
import { createRecoverySessionStore } from "./recoverySession.js";

test("recovery persists before subscribers mount and clears on logout or user change", () => {
  const store = createRecoverySessionStore();
  store.observe("PASSWORD_RECOVERY", { user: { id: "recovering" } });
  assert.equal(store.getSnapshot(), true);
  store.observe("INITIAL_SESSION", { user: { id: "recovering" } });
  assert.equal(store.getSnapshot(), true);
  store.observe("SIGNED_IN", { user: { id: "someone-else" } });
  assert.equal(store.getSnapshot(), false);
  store.observe("PASSWORD_RECOVERY", { user: { id: "recovering" } });
  store.observe("SIGNED_OUT", null);
  assert.equal(store.getSnapshot(), false);
});

import assert from "node:assert/strict";

import { getAccountName, getAccountStatus } from "./accountStatus.js";

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const confirmedSession = {
  user: {
    email_confirmed_at: "2026-07-10T12:00:00.000Z",
    user_metadata: { display_name: "Sleeve Note" },
  },
};

test("account status follows session verification and membership approval", () => {
  assert.equal(getAccountStatus(null, null), "signed-out");
  assert.equal(getAccountStatus({ user: { email_confirmed_at: null } }, null), "unverified");
  assert.equal(getAccountStatus(confirmedSession, null), "pending");
  assert.equal(getAccountStatus(confirmedSession, { status: "pending" }), "pending");
  assert.equal(getAccountStatus(confirmedSession, { status: "rejected" }), "blocked");
  assert.equal(getAccountStatus(confirmedSession, { status: "approved" }), "approved");
});

test("account name prefers the approved profile and falls back to auth metadata", () => {
  assert.equal(getAccountName(confirmedSession, { display_name: "  Club Member  " }), "Club Member");
  assert.equal(getAccountName(confirmedSession, null), "Sleeve Note");
  assert.equal(getAccountName({ user: { user_metadata: {} } }, null), "Account");
});

import assert from "node:assert/strict";

import {
  createEventId,
  eventToUpsertPayload,
  formatDisplayDate,
  validateEventForm,
} from "./siteContent.js";

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("event ids are stable slugs from date and title", () => {
  assert.equal(createEventId("Summer Listening Night!", "2026-06-18"), "2026-06-18-summer-listening-night");
});

test("display dates are derived from ISO dates", () => {
  assert.equal(formatDisplayDate("2026-06-18"), "June 18, 2026");
});

test("event payload trims fields and fills display date", () => {
  const payload = eventToUpsertPayload({
    id: "",
    title: "  Record store run  ",
    date: "2026-06-06",
    displayDate: "",
    time: " 2:00 PM ",
    location: " Zia Records Tempe ",
    status: "upcoming",
    tag: "",
    description: " Browse records. ",
  });

  assert.equal(payload.id, "2026-06-06-record-store-run");
  assert.equal(payload.display_date, "June 6, 2026");
  assert.equal(payload.tag, "upcoming");
  assert.equal(payload.description, "Browse records.");
});

test("event validation requires public-facing essentials", () => {
  assert.equal(validateEventForm({ title: "", date: "", time: "", location: "", status: "upcoming" }).isValid, false);
  assert.equal(validateEventForm({
    title: "Listening night",
    date: "2026-06-18",
    time: "7:15 PM",
    location: "Hayden Library C8",
    status: "upcoming",
    description: "",
    displayDate: "",
    tag: "",
    id: "",
  }).isValid, true);
});

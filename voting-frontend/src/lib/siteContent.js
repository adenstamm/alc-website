export const emptyEventForm = {
  id: "",
  title: "",
  date: "",
  displayDate: "",
  time: "",
  location: "",
  status: "upcoming",
  tag: "",
  description: "",
};

export function createEventId(title, date) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (slug) {
    return `${date || "event"}-${slug}`;
  }

  return date ? `event-${date}` : "";
}

export function formatDisplayDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function normalizeSiteEvent(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    displayDate: row.display_date || row.displayDate || formatDisplayDate(row.date),
    time: row.time,
    location: row.location,
    status: row.status,
    tag: row.tag,
    description: row.description,
  };
}

export function eventToUpsertPayload(eventForm) {
  const title = (eventForm.title || "").trim();
  const date = eventForm.date;
  const id = (eventForm.id || createEventId(title, date)).trim();
  const displayDate = (eventForm.displayDate || "").trim() || formatDisplayDate(date);
  const payload = {
    id,
    title,
    date,
    display_date: displayDate,
    time: (eventForm.time || "").trim(),
    location: (eventForm.location || "").trim(),
    status: eventForm.status,
    tag: (eventForm.tag || "").trim() || eventForm.status,
    description: (eventForm.description || "").trim(),
  };

  return payload;
}

export function validateEventForm(eventForm) {
  const payload = eventToUpsertPayload(eventForm);

  if (!payload.id || !payload.title || !payload.date || !payload.time || !payload.location) {
    return {
      isValid: false,
      message: "Add a title, date, time, and location before saving the event.",
      payload,
    };
  }

  if (!["upcoming", "recent"].includes(payload.status)) {
    return {
      isValid: false,
      message: "Choose whether this event is upcoming or recent.",
      payload,
    };
  }

  return {
    isValid: true,
    message: null,
    payload,
  };
}

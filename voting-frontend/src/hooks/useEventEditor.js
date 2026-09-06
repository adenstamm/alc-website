import {
  createEventId,
  emptyEventForm,
  eventToUpsertPayload,
  validateEventForm,
} from "../lib/siteContent";
import { getNextUpcomingEvent } from "../lib/adminPresentation";
import { useMemo, useState } from "react";

export default function useEventEditor({
  openConfirmation,
  refreshEvents,
  setError,
  setIsSavingContent,
  setMessage,
  showConfirmation,
  showFailure,
  siteEvents,
  supabase,
}) {
  const [eventForm, setEventForm] = useState(emptyEventForm);

  const [editingEventId, setEditingEventId] = useState(null);

  const sortedSiteEvents = useMemo(
    () =>
      [...siteEvents].sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "upcoming" ? -1 : 1;
        }

        return a.date.localeCompare(b.date);
      }),
    [siteEvents],
  );

  const nextUpcomingEvent = getNextUpcomingEvent(sortedSiteEvents);

  function handleEventChange(event) {
    const { name, value } = event.target;

    setEventForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [name]: value,
      };

      if (
        (name === "title" || name === "date") &&
        (!currentForm.id ||
          currentForm.id === createEventId(currentForm.title, currentForm.date))
      ) {
        nextForm.id = createEventId(
          name === "title" ? value : currentForm.title,
          name === "date" ? value : currentForm.date,
        );
      }

      return nextForm;
    });
  }

  function handleEventEdit(eventItem) {
    setEditingEventId(eventItem.id);
    setEventForm({
      id: eventItem.id,
      title: eventItem.title,
      date: eventItem.date,
      displayDate: eventItem.displayDate,
      time: eventItem.time,
      location: eventItem.location,
      status: eventItem.status,
      tag: eventItem.tag,
      description: eventItem.description,
    });
  }

  function resetEventForm() {
    setEditingEventId(null);
    setEventForm(emptyEventForm);
  }

  async function handleEventSave(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const validation = validateEventForm(eventForm);

    if (!validation.isValid) {
      setError(validation.message);
      return;
    }

    setIsSavingContent(true);

    const { error: saveError } = await supabase
      .from("site_events")
      .upsert(eventToUpsertPayload(eventForm), { onConflict: "id" });

    setIsSavingContent(false);

    if (saveError) {
      setError(saveError.message);
      showFailure(saveError.message);
      return;
    }

    const successMessage = editingEventId ? "Event updated." : "Event added.";
    setMessage(successMessage);
    showConfirmation(successMessage, "event-save");
    resetEventForm();
    await refreshEvents();
  }

  async function handleEventDelete(eventId) {
    setError(null);
    setMessage(null);
    setIsSavingContent(true);

    const { error: deleteError } = await supabase
      .from("site_events")
      .delete()
      .eq("id", eventId);

    setIsSavingContent(false);

    if (deleteError) {
      setError(deleteError.message);
      showFailure(deleteError.message);
      return;
    }

    if (editingEventId === eventId) {
      resetEventForm();
    }

    setMessage("Event deleted.");
    showConfirmation("Event deleted.", "event-delete");
    await refreshEvents();
  }

  function requestEventDelete(eventItem) {
    openConfirmation({
      confirmLabel: "Delete event",
      description: `${eventItem.title} will be removed from the home page and events page.`,
      onConfirm: () => handleEventDelete(eventItem.id),
      title: "Delete this event?",
    });
  }
  return {
    eventForm,
    editingEventId,
    sortedSiteEvents,
    nextUpcomingEvent,
    handleEventChange,
    handleEventEdit,
    resetEventForm,
    handleEventSave,
    requestEventDelete,
  };
}

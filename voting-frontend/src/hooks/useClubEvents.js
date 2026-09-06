import { EVENT_ROUTES } from "../lib/clubPollState.js";
import { hasSiteEventsConfig, supabase } from "../lib/supabaseClient";
import { normalizeSiteEvent } from "../lib/siteContent";
import { specialEvents } from "../data/clubContent";
import { useCallback, useEffect, useState } from "react";

export default function useClubEvents({ currentPath }) {
  const [liveEvents, setLiveEvents] = useState(
    hasSiteEventsConfig ? null : specialEvents,
  );

  const [eventsReady, setEventsReady] = useState(!hasSiteEventsConfig);

  const refreshEvents = useCallback(async () => {
    if (!hasSiteEventsConfig) {
      setLiveEvents(specialEvents);
      setEventsReady(true);
      return specialEvents;
    }

    try {
      const { data, error } = await supabase
        .from("site_events")
        .select(
          "id, title, date, display_date, time, location, status, tag, description",
        )
        .order("date", { ascending: true });

      if (error) {
        setLiveEvents(specialEvents);
        return specialEvents;
      }

      const nextEvents = data.map(normalizeSiteEvent);
      setLiveEvents(nextEvents);
      return nextEvents;
    } catch {
      setLiveEvents(specialEvents);
      return specialEvents;
    } finally {
      setEventsReady(true);
    }
  }, []);

  useEffect(() => {
    if (EVENT_ROUTES.has(currentPath)) refreshEvents();
  }, [currentPath, refreshEvents]);
  return { liveEvents, eventsReady, refreshEvents };
}

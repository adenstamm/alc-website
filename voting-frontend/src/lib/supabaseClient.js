import { createClient } from "@supabase/supabase-js";
import { recoverySessionStore } from "./recoverySession";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const enableSiteEvents = import.meta.env.VITE_ENABLE_SITE_EVENTS;

const placeholderProjectHost = ["your-project", "supabase", "co"].join(".");
const placeholderAnonKey = ["your", "anon", "key"].join("-");

function hasRealEnvValue(value, placeholder) {
  return Boolean(value && value !== placeholder);
}

export const hasSupabaseConfig =
  hasRealEnvValue(supabaseUrl, `https://${placeholderProjectHost}`) &&
  hasRealEnvValue(supabaseAnonKey, placeholderAnonKey);

export const hasSiteEventsConfig =
  hasSupabaseConfig && enableSiteEvents === "true";

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Subscribe before route modules load, so recovery events cannot be missed.
const recoverySubscription = supabase?.auth.onAuthStateChange(
  (event, session) => {
    recoverySessionStore.observe(event, session);
  },
).data.subscription;
if (import.meta.hot) {
  import.meta.hot.dispose(() => recoverySubscription?.unsubscribe());
}

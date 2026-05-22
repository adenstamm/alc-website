import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const placeholderProjectHost = ["your-project", "supabase", "co"].join(".");
const placeholderAnonKey = ["your", "anon", "key"].join("-");

function hasRealEnvValue(value, placeholder) {
  return Boolean(value && value !== placeholder);
}

export const hasSupabaseConfig =
  hasRealEnvValue(supabaseUrl, `https://${placeholderProjectHost}`) &&
  hasRealEnvValue(supabaseAnonKey, placeholderAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

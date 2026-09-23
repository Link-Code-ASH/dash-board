import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kjincyabqwqdmvcctsvq.supabase.co";
const publishableKey = "sb_publishable_epVTDY45ypijPec0oWnFFQ_7C4VUtdS";

export const accountClient = createClient(supabaseUrl, publishableKey, {
  auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

export async function readAccountData(userId) {
  const { data, error } = await accountClient
    .from("hub_user_data")
    .select("payload, revision, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAccountData(userId, payload) {
  const { data, error } = await accountClient
    .from("hub_user_data")
    .insert({ user_id: userId, payload })
    .select("revision")
    .single();
  if (error) throw error;
  return data.revision;
}

export async function updateAccountData(userId, payload, revision) {
  const { data, error } = await accountClient
    .from("hub_user_data")
    .update({ payload, revision: revision + 1, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("revision", revision)
    .select("revision")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CLOUD_CONFLICT");
  return data.revision;
}

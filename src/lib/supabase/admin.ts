import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Один клиент на процесс: сервисная роль не держит пользовательской сессии,
// поэтому переиспользование безопасно, а новые экземпляры на каждый вызов
// только плодят соединения с PostgREST.
let adminClient: SupabaseClient | null = null;

export function createSupabaseAdminClient() {
  if (!adminClient) {
    adminClient = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

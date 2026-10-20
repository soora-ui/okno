import { DateTime } from "luxon";
import {
  parseAcquisitionSource,
  summarizeAcquisitionSources,
  type AcquisitionSourceStat,
} from "@/lib/acquisition-sources";
import { logError } from "@/lib/observability/logger";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const acquisitionStatsDays = 30;

// Онлайн-записи мастера за 30 дней по источникам. Отменённые тоже считаем:
// клиент пришёл и записался — канал сработал. null — сводку показать нельзя
// (нет колонки до миграции или база не ответила), карточка остаётся со
// ссылками, но без цифр.
export async function getOwnerAcquisitionStats(input: {
  profileId: string;
  source: "mock" | "supabase";
}): Promise<AcquisitionSourceStat[] | null> {
  // В демо и локальном режиме меток у записей нет — честнее показать пустую
  // сводку, чем выдумывать каналы.
  if (input.source === "mock") return [];

  const supabase = await createSupabaseServerClient();
  const since = DateTime.now().minus({ days: acquisitionStatsDays }).toUTC().toISO();
  const { data, error } = await supabase
    .from("bookings")
    .select("acquisition_source")
    .eq("profile_id", input.profileId)
    .eq("source", "public_page")
    .gte("created_at", since);

  if (error) {
    if (!isSupabaseMissingColumnError(error, "acquisition_source")) {
      logError("Acquisition stats: query failed", { profileId: input.profileId, error });
    }
    return null;
  }

  return summarizeAcquisitionSources(
    (data ?? []).map((row) =>
      parseAcquisitionSource((row as { acquisition_source?: unknown }).acquisition_source),
    ),
  );
}

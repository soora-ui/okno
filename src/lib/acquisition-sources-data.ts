import { DateTime } from "luxon";
import {
  parseAcquisitionSource,
  type AcquisitionSource,
  summarizeAcquisitionSources,
  type AcquisitionSourceStat,
} from "@/lib/acquisition-sources";
import { DEMO_CABINET_PROFILE_ID } from "@/lib/demo-cabinet-data";
import { logError } from "@/lib/observability/logger";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const acquisitionStatsDays = 30;

// Демо-кабинет (база знаний) показывает живую сводку: с пустой не объяснить,
// как читать карточку.
const demoCabinetSources: Array<[AcquisitionSource | null, number]> = [
  ["instagram", 9],
  ["telegram", 5],
  ["vk", 3],
  ["yandex_maps", 2],
  [null, 4],
];

// Онлайн-записи мастера за 30 дней по источникам. Отменённые тоже считаем:
// клиент пришёл и записался — канал сработал. null — сводку показать нельзя
// (нет колонки до миграции или база не ответила), карточка остаётся со
// ссылками, но без цифр.
export async function getOwnerAcquisitionStats(input: {
  profileId: string;
  source: "mock" | "supabase";
}): Promise<AcquisitionSourceStat[] | null> {
  if (input.profileId === DEMO_CABINET_PROFILE_ID) {
    return summarizeAcquisitionSources(
      demoCabinetSources.flatMap(([source, count]) => Array<AcquisitionSource | null>(count).fill(source)),
    );
  }

  // В локальном режиме меток у записей нет — честнее показать пустую
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

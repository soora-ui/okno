import { brandMaterialKinds, type BrandMaterial, type BrandMaterialKind } from "@/lib/brand-theme/materials";
import { profileMediaBucket } from "@/lib/profile-media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Хранение материалов мастера. Приватный бакет brand-materials читает и
// пишет только сервер; клиент знает материалы лишь по id из brand_materials.

export const brandMaterialsBucket = "brand-materials";

export type StoredBrandMaterial = {
  id: string;
  kind: BrandMaterialKind;
  name: string;
  mime: string;
  sizeBytes: number;
  pageCount: number | null;
  moderation: "pending" | "ok" | "rejected";
  createdAt: string;
};

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

function mapRow(row: Record<string, unknown>): StoredBrandMaterial {
  return {
    id: String(row.id),
    kind: brandMaterialKinds.includes(row.kind as BrandMaterialKind)
      ? (row.kind as BrandMaterialKind)
      : "example",
    name: String(row.name),
    mime: String(row.mime),
    sizeBytes: Number(row.size_bytes),
    pageCount: row.page_count === null ? null : Number(row.page_count),
    moderation: row.moderation as StoredBrandMaterial["moderation"],
    createdAt: String(row.created_at),
  };
}

const columns = "id, kind, name, mime, size_bytes, page_count, moderation, created_at, storage_path";

export async function listBrandMaterials(profileId: string): Promise<StoredBrandMaterial[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_materials")
    .select(columns)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function countBrandMaterials(profileId: string, kind: BrandMaterialKind) {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("brand_materials")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("kind", kind);
  if (error) throw error;
  return count ?? 0;
}

export async function saveBrandMaterial(
  profileId: string,
  material: BrandMaterial,
): Promise<StoredBrandMaterial> {
  const admin = createSupabaseAdminClient();
  const path = `${profileId}/${crypto.randomUUID()}.${extensions[material.type]}`;

  const { error: uploadError } = await admin.storage
    .from(brandMaterialsBucket)
    .upload(path, material.bytes, { contentType: material.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await admin
    .from("brand_materials")
    .insert({
      profile_id: profileId,
      kind: material.kind,
      name: material.name.slice(0, 200),
      mime: material.type,
      size_bytes: material.bytes.byteLength,
      page_count: material.pageCount,
      storage_path: path,
    })
    .select(columns)
    .single();

  if (error || !data) {
    await admin.storage.from(brandMaterialsBucket).remove([path]);
    throw error ?? new Error("brand material insert returned no row");
  }
  return mapRow(data as Record<string, unknown>);
}

export async function deleteBrandMaterial(profileId: string, materialId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_materials")
    .delete()
    .eq("id", materialId)
    .eq("profile_id", profileId)
    .select("storage_path")
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  await admin.storage.from(brandMaterialsBucket).remove([String(data.storage_path)]);
  return true;
}

/**
 * Загружает материалы мастера по id. Чужие id и не прошедшие модерацию
 * файлы молча отбрасываются — в Claude уходит только своё и допустимое.
 */
export async function loadBrandMaterials(
  profileId: string,
  ids: string[],
): Promise<(BrandMaterial & { id: string })[]> {
  if (ids.length === 0) return [];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_materials")
    .select(columns)
    .eq("profile_id", profileId)
    .in("id", ids)
    .neq("moderation", "rejected");
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const ordered = ids
    .map((id) => rows.find((row) => String(row.id) === id))
    .filter((row): row is Record<string, unknown> => Boolean(row));

  return Promise.all(
    ordered.map(async (row) => {
      const { data: blob, error: downloadError } = await admin.storage
        .from(brandMaterialsBucket)
        .download(String(row.storage_path));
      if (downloadError || !blob) throw downloadError ?? new Error("brand material missing");
      const stored = mapRow(row);
      return {
        id: stored.id,
        kind: stored.kind,
        name: stored.name,
        type: stored.mime as BrandMaterial["type"],
        bytes: new Uint8Array(await blob.arrayBuffer()),
        pageCount: stored.pageCount,
      };
    }),
  );
}

export async function setBrandMaterialModeration(
  profileId: string,
  verdicts: { id: string; moderation: "ok" | "rejected" }[],
) {
  const admin = createSupabaseAdminClient();
  for (const moderation of ["ok", "rejected"] as const) {
    const ids = verdicts.filter((verdict) => verdict.moderation === moderation).map((v) => v.id);
    if (ids.length === 0) continue;
    const { error } = await admin
      .from("brand_materials")
      .update({ moderation })
      .eq("profile_id", profileId)
      .in("id", ids);
    if (error) throw error;
  }
}

/**
 * Публикует логотип на страницу: PNG из приватного бакета копируется в
 * profile-media под путь, который пропускает схема темы. Возвращает путь
 * для theme.logo.
 */
export async function publishBrandLogo(
  authId: string,
  material: BrandMaterial,
): Promise<string | null> {
  // Логотип принимается только в SVG или PNG, SVG при загрузке уже стал PNG.
  if (material.type !== "image/png") return null;
  const path = `${authId}/brand-logo/${crypto.randomUUID()}.png`;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(profileMediaBucket)
    .upload(path, material.bytes, { contentType: "image/png", upsert: false });
  if (error) throw error;
  return path;
}

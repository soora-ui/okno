import { createClient } from "@supabase/supabase-js";

const bucket = "profile-media";
const write = process.argv.includes("--write");
const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
const profileFilter = profileArg ? profileArg.slice("--profile=".length) : null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function extensionForMimeType(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
}

function decodeDataUrl(value) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Unsupported data URL format.");
  }

  const [, mimeType, base64] = match;
  return {
    mimeType,
    bytes: Buffer.from(base64, "base64"),
  };
}

function getMimeTypeFromDataUrl(value) {
  const match = value.match(/^data:([^;]+);base64,/);

  if (!match) {
    throw new Error("Unsupported data URL format.");
  }

  return match[1];
}

function buildPath(ownerId, kind, mimeType) {
  const extension = extensionForMimeType(mimeType);
  return `${ownerId}/${kind}/legacy-${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

async function uploadDataUrl(ownerId, kind, value) {
  const { mimeType, bytes } = decodeDataUrl(value);
  const path = buildPath(ownerId, kind, mimeType);
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || `Failed to upload ${kind} media.`);
  }

  return path;
}

function normalizePortfolioWorks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (typeof item === "string" && item) {
      return [
        {
          id: `legacy-${index + 1}`,
          imageUrl: item,
          path: null,
        },
      ];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    return [
      {
        id:
          typeof item.id === "string" && item.id.trim()
            ? item.id
            : `legacy-${index + 1}`,
        imageUrl:
          typeof item.imageUrl === "string"
            ? item.imageUrl
            : typeof item.url === "string"
              ? item.url
              : "",
        path: typeof item.path === "string" && item.path ? item.path : null,
      },
    ].filter((work) => work.imageUrl);
  });
}

function summarizePaths(paths) {
  return paths.length === 0 ? "-" : paths.join(", ");
}

const select = "id,username,password_auth_id,avatar_url,portfolio_works";
let query = supabase.from("profiles").select(select).order("created_at");

if (profileFilter) {
  query = query.eq("username", profileFilter);
}

const { data: profiles, error } = await query;

if (error) {
  throw error;
}

let changedCount = 0;

for (const profile of profiles ?? []) {
  const nextUpdate = {};
  const uploadedPaths = [];
  const avatarNeedsMigration = isDataUrl(profile.avatar_url);
  const works = normalizePortfolioWorks(profile.portfolio_works);
  let portfolioChanged = false;

  if (avatarNeedsMigration) {
    const avatarPath = write
      ? await uploadDataUrl(
          profile.password_auth_id,
          "avatar",
          profile.avatar_url,
        )
      : buildPath(
          profile.password_auth_id,
          "avatar",
          getMimeTypeFromDataUrl(profile.avatar_url),
        );
    nextUpdate.avatar_url = avatarPath;
    uploadedPaths.push(avatarPath);
  }

  const nextWorks = [];
  for (const work of works) {
    if (isDataUrl(work.imageUrl)) {
      const path = write
        ? await uploadDataUrl(
            profile.password_auth_id,
            "portfolio",
            work.imageUrl,
          )
        : buildPath(
            profile.password_auth_id,
            "portfolio",
            getMimeTypeFromDataUrl(work.imageUrl),
          );
      uploadedPaths.push(path);
      portfolioChanged = true;
      nextWorks.push({
        id: work.id,
        imageUrl: path,
        path,
      });
      continue;
    }

    nextWorks.push(work);
  }

  if (portfolioChanged) {
    nextUpdate.portfolio_works = nextWorks;
  }

  if (Object.keys(nextUpdate).length === 0) {
    continue;
  }

  changedCount += 1;

  console.log(
    [
      `profile=${profile.username}`,
      `avatar=${avatarNeedsMigration ? "migrate" : "keep"}`,
      `portfolioMigrated=${portfolioChanged ? "yes" : "no"}`,
      `uploads=${summarizePaths(uploadedPaths)}`,
      `mode=${write ? "write" : "dry-run"}`,
    ].join(" "),
  );

  if (!write) {
    continue;
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update(nextUpdate)
    .eq("id", profile.id);

  if (updateError) {
    throw updateError;
  }
}

console.log(
  `Processed ${profiles?.length ?? 0} profiles. ${changedCount} profile(s) require migration.`,
);

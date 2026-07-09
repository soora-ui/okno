export type PortfolioWork = {
  id: string;
  imageUrl: string;
  path: string | null;
};

export const defaultAvatarUrl = "/demo/avatar.svg";
export const profileMediaBucket = "profile-media";

export const acceptedImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export const maxAvatarFileSizeBytes = 8 * 1024 * 1024;
export const maxPortfolioFileSizeBytes = 8 * 1024 * 1024;
export const maxAvatarUploadFileSizeBytes = 1.5 * 1024 * 1024;
export const maxPortfolioUploadFileSizeBytes = 2 * 1024 * 1024;
export const maxAvatarImageDimension = 720;
export const maxPortfolioImageDimension = 1800;
export const imageCompressionMimeType = "image/webp";
export const imageCompressionQuality = 0.82;
export const maxPortfolioWorks = 15;

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";

export function isAcceptedImageMimeType(type: string) {
  return acceptedImageMimeTypes.includes(
    type as (typeof acceptedImageMimeTypes)[number],
  );
}

export function isAbsoluteMediaUrl(value: string) {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  );
}

export function isStoragePath(value: string) {
  return Boolean(value) && !isAbsoluteMediaUrl(value);
}

export function resolveProfileMediaUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (!isStoragePath(value)) {
    return value;
  }

  if (!publicSupabaseUrl) {
    return value;
  }

  const encodedPath = value.split("/").map(encodeURIComponent).join("/");
  return `${publicSupabaseUrl}/storage/v1/object/public/${profileMediaBucket}/${encodedPath}`;
}

export function getStoredProfileMediaPath(value: string | null | undefined) {
  if (!value || !isStoragePath(value)) {
    return null;
  }

  return value;
}

function getFileExtension(fileName: string, mimeType: string) {
  const nameExtension = fileName.split(".").pop()?.trim().toLowerCase();

  if (nameExtension && /^[a-z0-9]+$/.test(nameExtension)) {
    return nameExtension === "jpeg" ? "jpg" : nameExtension;
  }

  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
}

export function buildProfileMediaStoragePath(input: {
  ownerId: string;
  kind: "avatar" | "portfolio";
  file: File;
}) {
  const extension = getFileExtension(input.file.name, input.file.type);
  return `${input.ownerId}/${input.kind}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export function isOwnedProfileMediaPath(
  path: string,
  ownerId: string,
  kind?: "avatar" | "portfolio",
) {
  const segments = path.split("/");

  if (segments.length < 3) {
    return false;
  }

  return segments[0] === ownerId && (kind ? segments[1] === kind : true);
}

export function buildPortfolioWorksFromPaths(paths: string[]): PortfolioWork[] {
  return paths.map((path) => ({
    id: crypto.randomUUID(),
    imageUrl: resolveProfileMediaUrl(path) ?? path,
    path,
  }));
}

export function extractPortfolioStoragePaths(works: PortfolioWork[]) {
  return works.flatMap((work) => (work.path ? [work.path] : []));
}

export function parsePortfolioWorks(value: unknown): PortfolioWork[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item, index) => {
      if (typeof item === "string" && item) {
        return [
          {
            id: `work-${index + 1}`,
            imageUrl: resolveProfileMediaUrl(item) ?? item,
            path: getStoredProfileMediaPath(item),
          },
        ];
      }

      if (!item || typeof item !== "object") {
        return [];
      }

      const work = item as {
        id?: unknown;
        imageUrl?: unknown;
        url?: unknown;
        path?: unknown;
      };

      const storedPath =
        typeof work.path === "string" && work.path
          ? work.path
          : typeof work.imageUrl === "string" && isStoragePath(work.imageUrl)
            ? work.imageUrl
            : typeof work.url === "string" && isStoragePath(work.url)
              ? work.url
              : null;
      const explicitUrl =
        typeof work.imageUrl === "string" && work.imageUrl
          ? work.imageUrl
          : typeof work.url === "string" && work.url
            ? work.url
            : null;
      const imageUrl = resolveProfileMediaUrl(storedPath ?? explicitUrl);

      if (!imageUrl) {
        return [];
      }

      return [
        {
          id:
            typeof work.id === "string" && work.id.trim()
              ? work.id
              : `work-${index + 1}`,
          imageUrl,
          path: storedPath,
        },
      ];
    })
    .slice(0, maxPortfolioWorks);
}

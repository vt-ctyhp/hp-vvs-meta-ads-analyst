export type CreativeDisplayMedia = {
  thumbnailUrl: string | null;
  imageUrl: string | null;
};

export type CreativeDisplayMediaInput = {
  [key: string]: unknown;
  supabase_thumbnail_url?: unknown;
  supabase_image_url?: unknown;
};

export function resolveCreativeDisplayMedia(
  creative: CreativeDisplayMediaInput | null | undefined,
): CreativeDisplayMedia {
  const supabaseThumbnailUrl = stringOrNull(creative?.supabase_thumbnail_url);
  const supabaseImageUrl = stringOrNull(creative?.supabase_image_url);

  return {
    thumbnailUrl: supabaseThumbnailUrl || supabaseImageUrl,
    imageUrl: supabaseImageUrl || supabaseThumbnailUrl,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

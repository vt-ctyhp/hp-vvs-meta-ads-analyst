export type BrandLabel = "HP" | "VVS" | "Unassigned";

const HP_SOCIAL_IDS = new Set(["100615618793615", "17841473309777050"]);
const VVS_SOCIAL_IDS = new Set<string>();

export function inferSocialBrand(
  pageId: string | null | undefined,
  igUserId: string | null | undefined,
): BrandLabel {
  const ids = [pageId, igUserId].filter(Boolean) as string[];
  if (ids.some((id) => HP_SOCIAL_IDS.has(id))) return "HP";
  if (ids.some((id) => VVS_SOCIAL_IDS.has(id))) return "VVS";
  return "Unassigned";
}

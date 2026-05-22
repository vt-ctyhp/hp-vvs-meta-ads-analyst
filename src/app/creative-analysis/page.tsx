import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CreativeAnalysisRedirectPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const query = searchParams ? queryString(await searchParams) : "";
  redirect(query ? `/analyst/creative-analysis?${query}` : "/analyst/creative-analysis");
}

function queryString(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else {
      query.set(key, value);
    }
  }
  return query.toString();
}

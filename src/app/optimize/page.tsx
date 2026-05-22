import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OptimizeRedirectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const tab = firstParam(params.tab);
  const query = queryWithoutTab(params);

  if (tab === "ai") {
    redirect(query ? `/analysis?${query}` : "/analysis");
  }

  if (tab === "creatives") {
    redirect(query ? `/analyst/creative-analysis?${query}` : "/analyst/creative-analysis");
  }

  redirect(query ? `/analyst?${query}` : "/analyst");
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryWithoutTab(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else {
      query.set(key, value);
    }
  }
  return query.toString();
}

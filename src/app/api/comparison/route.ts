import { comparisonSectionIds, getComparisonGroup, type ComparisonSectionId } from "@/lib/comparison";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const section = params.get("section") ?? "";
  const primary = params.get("kunta") ?? "";
  const peer = params.get("vertaa") ?? "";
  const year = params.get("vuosi") ?? "";
  if (!comparisonSectionIds.includes(section as ComparisonSectionId) || !/^KU\d{3}$/.test(primary) ||
      !/^KU\d{3}$/.test(peer) || primary === peer || !/^\d{4}$/.test(year) || Number(year) < 1990 || Number(year) > 2025) {
    return Response.json({ error: "Virheellinen vertailupyyntö" }, { status: 400 });
  }
  const group = await getComparisonGroup(section as ComparisonSectionId, [primary, peer], year);
  return Response.json(group, { status: group.failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}

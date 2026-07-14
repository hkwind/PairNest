import { PairNestApp } from "@/components/pairnest-app";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<{ coupleId?: string }>;
}) {
  const params = await searchParams;
  return <PairNestApp initialCoupleId={params?.coupleId || DEFAULT_WORKSPACE_SLUG} />;
}

import { PairNestApp } from "@/components/pairnest-app";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";

export default function Home() {
  return <PairNestApp initialCoupleId={DEFAULT_WORKSPACE_SLUG} />;
}

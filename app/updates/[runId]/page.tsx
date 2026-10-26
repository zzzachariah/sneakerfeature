import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogueMaintenanceRun } from "@/lib/data/catalogue-updates";
import { UpdateDetail } from "@/components/updates/update-detail";
import { UpdateRecordState } from "@/components/updates/update-record-state";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ runId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { runId } = await params;
  const result = await getCatalogueMaintenanceRun(runId);
  if (result.state !== "ready") return { title: "Maintenance report | SneakerFeature", robots: { index: false } };
  const title = `${result.run.report.title.en} | SneakerFeature`;
  const description = result.run.report.summary.en.slice(0, 180);
  return { title, description, alternates: { canonical: absoluteUrl(`/updates/${runId}`) },
    openGraph: { title, description, url: absoluteUrl(`/updates/${runId}`), type: "article", images: [{ url: DEFAULT_OG_IMAGE_URL }] },
  };
}

export default async function UpdateDetailPage({ params }: Props) {
  const { runId } = await params;
  const result = await getCatalogueMaintenanceRun(runId);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable") return <UpdateRecordState state="unavailable" />;
  return <UpdateDetail key={result.run.id} run={result.run} />;
}

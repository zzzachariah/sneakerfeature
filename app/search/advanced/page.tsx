import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DynamicTranslatedText } from "@/components/i18n/dynamic-translated-text";
import { getShoes } from "@/lib/data/shoes";
import { normalizeSearchText, rankShoeMatch } from "@/lib/search/shoe-search";
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

const title = "Advanced sneaker search | sneakerfeature";
const description = "Search basketball shoe specs, tags, tech, and player data.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl("/search/advanced"),
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/search/advanced"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default async function AdvancedSearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; brand?: string; category?: string; player?: string; tech?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const brand = normalizeSearchText(params.brand);
  const category = normalizeSearchText(params.category);
  const player = params.player ?? "";
  const tech = params.tech ?? "";

  const shoes = await getShoes();

  const brands = Array.from(new Set(shoes.map((s) => s.brand).filter(Boolean))).sort();
  const categories = Array.from(new Set(shoes.map((s) => s.category).filter(Boolean) as string[])).sort();

  const filtered = shoes
    .map((shoe) => ({ shoe, score: rankShoeMatch(shoe, q) }))
    .filter(({ shoe, score }) => {
      const techText = `${shoe.spec.forefoot_midsole_tech ?? ""} ${shoe.spec.heel_midsole_tech ?? ""} ${shoe.spec.upper_tech ?? ""} ${shoe.spec.outsole_tech ?? ""} ${(shoe.spec.tags ?? []).join(" ")}`;

      if (score < 0) return false;
      if (brand && normalizeSearchText(shoe.brand) !== brand) return false;
      if (category && normalizeSearchText(shoe.category) !== category) return false;
      if (player && !normalizeSearchText(shoe.player).includes(normalizeSearchText(player))) return false;
      if (tech && !normalizeSearchText(techText).includes(normalizeSearchText(tech))) return false;

      return true;
    })
    .sort((a, b) => b.score - a.score)
    .map(({ shoe }) => shoe);

  return (
    <main className="container-shell space-y-6 pt-8" style={{ paddingBottom: "calc(var(--mobile-nav-h) + 2rem)" }}>
      <section className="surface-card premium-border rounded-3xl p-6 md:p-7">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[rgb(var(--accent))]" />
          <DynamicTranslatedText
            as="div"
            text="Advanced Search"
            className="text-2xl font-semibold"
          />
        </div>
        <DynamicTranslatedText
          as="p"
          text="Use structured filters here. The home table search remains your quick/basic search."
          className="mt-2 text-sm soft-text"
        />

        <form action="/search/advanced" method="GET" className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="md:col-span-2 lg:col-span-3">
            <DynamicTranslatedText as="div" text="Keywords" className="mb-1 block text-xs soft-text" />
            <Input name="q" defaultValue={params.q ?? ""} placeholder="Name, tags, tech, notes..." />
          </div>

          <div>
            <DynamicTranslatedText as="div" text="Brand" className="mb-1 block text-xs soft-text" />
            <Select name="brand" defaultValue={params.brand ?? ""}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </div>

          <div>
            <DynamicTranslatedText as="div" text="Category" className="mb-1 block text-xs soft-text" />
            <Select name="category" defaultValue={params.category ?? ""}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>

          <div>
            <DynamicTranslatedText as="div" text="Player" className="mb-1 block text-xs soft-text" />
            <Input name="player" defaultValue={params.player ?? ""} placeholder="e.g. LeBron" />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <DynamicTranslatedText as="div" text="Tech focus" className="mb-1 block text-xs soft-text" />
            <Input name="tech" defaultValue={params.tech ?? ""} placeholder="e.g. Zoom, traction pattern, carbon plate" />
          </div>

          <div className="md:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-2">
            <Button type="submit" className="inline-flex items-center gap-1.5">
              <Search className="h-4 w-4" />
              <DynamicTranslatedText text="Search" />
            </Button>
            <Link href="/search/advanced">
              <Button type="button" variant="secondary">
                <DynamicTranslatedText text="Reset filters" />
              </Button>
            </Link>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <DynamicTranslatedText as="div" text="Results" className="text-lg font-semibold" />
          <p className="text-xs soft-text">{filtered.length} match{filtered.length === 1 ? "" : "es"}</p>
        </div>

        {filtered.length === 0 && (
          <Card className="p-6 text-center">
            <DynamicTranslatedText as="p" text="No results found" className="font-medium" />
            <DynamicTranslatedText
              as="p"
              text="Try broadening your keyword or removing one filter."
              className="mt-1 text-xs soft-text"
            />
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((shoe) => (
            <Card key={shoe.id} className="p-4">
              <p className="text-xs soft-text">{shoe.brand}{shoe.category ? ` • ${shoe.category}` : ""}</p>
              <h3 className="mt-1 font-semibold">{shoe.shoe_name}</h3>
              <p className="mt-1 text-xs soft-text">
                {shoe.player ?? <DynamicTranslatedText text="No player tag" />}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(shoe.spec.tags ?? []).slice(0, 3).map((tag) => <Badge key={tag}>{tag}</Badge>)}
              </div>
              <div className="mt-3">
                <Link href={`/shoes/${shoe.slug}`} className="text-sm text-[rgb(var(--accent))] hover:underline">
                  <DynamicTranslatedText text="Open detail" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

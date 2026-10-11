// A stable, ordered query must be rebuilt for each page; PostgREST's default
// row cap is not a completeness guarantee. Fail instead of returning a prefix.
export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < size) return rows;
  }
  throw new Error("Catalog exceeds the supported pagination limit");
}

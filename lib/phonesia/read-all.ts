type Result<T> = { data: T[] | null; error: { message: string; code?: string } | null };
type Query<T> = PromiseLike<Result<T>> & {
  order(column: string, options?: { ascending?: boolean }): Query<T>;
  range(from: number, to: number): Query<T>;
};

// Stable final ordering is essential when several rows share a timestamp.
// The page size stays below the production Data API row limit.
export async function readAll<T>(query: Query<T>, label = "dati", key = "id"): Promise<Result<T>> {
  const rows: T[] = [];
  const ordered = query.order(key, { ascending: true });
  for (let offset = 0; offset < 1_000_000; offset += 500) {
    const result = await ordered.range(offset, offset + 499);
    if (result.error) throw new Error(`Errore lettura ${label}: ${result.error.message}`);
    if (!result.data) throw new Error(`Risposta incompleta durante la lettura di ${label}`);
    rows.push(...result.data);
    if (result.data.length < 500) return { data: rows, error: null };
  }
  throw new Error(`Troppi record per completare la lettura di ${label}`);
}

export async function readByIds<T, K extends number | string>(ids: K[], query: (chunk: K[]) => Query<T>, label = "dati"): Promise<Result<T>> {
  const data: T[] = [];
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 200) {
    const result = await readAll(query(unique.slice(start, start + 200)), label);
    data.push(...(result.data || []));
  }
  return { data, error: null };
}

export async function checked<T extends { error: { message: string } | null }>(query: PromiseLike<T>, label = "dati"): Promise<T> {
  const result = await query;
  if (result.error) throw new Error(`Errore lettura ${label}: ${result.error.message}`);
  return result;
}

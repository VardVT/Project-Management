/**
 * Fetch all rows from a Supabase query, paging past the default 1000-row PostgREST limit.
 * @param {(from: number, to: number) => Promise<{ data: unknown[]|null, error: Error|null }>} buildQuery
 * @param {number} [pageSize=1000]
 */
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = []
  let from = 0
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await buildQuery(from, to)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

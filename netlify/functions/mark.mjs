import { fetchYahooMark, json } from './_yahoo.mjs'

export async function handler() {
  try {
    const mark = await fetchYahooMark()
    return json(mark)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'mark failed' },
      502,
    )
  }
}

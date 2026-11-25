/**
 * The day's unusual count, to Discord: a webhook into a private channel.
 *
 * It carries only the sentence it is given, never a word, a day or anything
 * from the flag, so no flag's content passes through Discord. The handler
 * gives it one fixed sentence, held by a test. The URL is set for Production
 * only, so a preview sends nothing.
 */
export function notifierFromEnv(
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch,
): ((text: string) => Promise<void>) | null {
  const url = env.FLAG_DISCORD_WEBHOOK_URL;
  if (!url) return null;
  return async (text) => {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`webhook answered ${res.status}`);
  };
}

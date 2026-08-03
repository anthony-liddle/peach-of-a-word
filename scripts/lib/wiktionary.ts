import { WIKTIONARY_USER_AGENT } from './config.ts';
import { fetchText, readCacheJson, sleep, writeCacheJson } from './util.ts';

export interface WordEntry {
  word: string;
  definition: string | null;
  etymology: string | null;
}

/** Raw, uncleaned API responses, cached so text cleanup stays re-runnable. */
interface RawResponses {
  word: string;
  /** Raw REST definition JSON, or null if the fetch did not yield one. */
  definitionJson: string | null;
  /** Raw rendered HTML of the Etymology section, or null. */
  etymologyHtml: string | null;
}

const HEADERS = {
  'User-Agent': WIKTIONARY_USER_AGENT,
  'Api-User-Agent': WIKTIONARY_USER_AGENT,
};

/** Be polite: a small pause between requests keeps us under the throttle line. */
const REQUEST_DELAY_MS = 120;

// --- Text cleanup (pure) -------------------------------------------------

function cleanText(input: string): string {
  let t = input;
  t = t.replace(/<style\b[\s\S]*?<\/style>/gi, ' '); // inline CSS (e.g. .defdate)
  t = t.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, ' '); // ref/footnote markers
  t = t.replace(/<[^>]+>/g, ' '); // remaining tags
  t = decodeEntities(t);
  t = t.replace(/[\u200B\u200E\u200F\u00AD]/g, ''); // zero-width + bidi marks
  t = t.replace(/\.mw-parser-output[^}]*}/g, ' '); // any stray CSS rule text
  t = t.replace(/\[\s*\d+\s*\]/g, ' '); // [1] style markers
  t = t.replace(/\s*\u2014\s*/g, ', '); // no em dashes anywhere, per the voice guide
  // Tighten spacing the rendered HTML leaves around punctuation and quotes.
  t = t.replace(/\s+([,.;:)\]”’])/g, '$1');
  t = t.replace(/([([“‘])\s+/g, '$1');
  t = t.replace(/\s+\+\s*\u200E?/g, ' + '); // surface-analysis joins
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8212;|&mdash;/g, ', ') // no em dashes, per the voice guide
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

interface RestDefinition {
  partOfSpeech?: string;
  definitions?: { definition?: string }[];
}

export interface FirstSense {
  pos: string | null;
  text: string;
}

/** Parse the cached REST JSON to its English senses, or an empty list. */
function englishSenses(definitionJson: string | null): RestDefinition[] {
  if (!definitionJson) return [];
  try {
    const json = JSON.parse(definitionJson) as Record<string, RestDefinition[]>;
    return json.en ?? [];
  } catch {
    return [];
  }
}

/**
 * A topical grouping line Wiktionary prints ahead of the real sub-senses, not a
 * definition itself (the "Terms relating to animals" header above the feline
 * sense of cat). Skipped so the real definition in the same sense is used.
 */
const PSEUDO_DEFINITION = /^Terms relating to\b/i;

/** Reduce one sense to its first usable definition, cleaned. pos is lowercased. */
function reduceSense(sense: RestDefinition): FirstSense | null {
  for (const d of sense.definitions ?? []) {
    if (!d.definition?.trim()) continue;
    const text = cleanText(d.definition);
    if (!text) continue;
    if (PSEUDO_DEFINITION.test(text)) continue;
    return { pos: sense.partOfSpeech?.toLowerCase() ?? null, text };
  }
  return null;
}

/** The first usable English sense, cleaned to plain text. pos is lowercased. */
export function firstSense(definitionJson: string | null): FirstSense | null {
  for (const sense of englishSenses(definitionJson)) {
    const reduced = reduceSense(sense);
    if (reduced) return reduced;
  }
  return null;
}

/**
 * Part-of-speech tags that read as wrong when shown for an everyday word.
 * Lowercased to match reduceSense. These carry the codes, names, and marks a
 * player taps a common word and does not expect (the ISO code under "car").
 */
const JUNK_POS = new Set([
  'symbol',
  'proper noun',
  'letter',
  'number',
  'numeral',
  'prefix',
  'suffix',
  'infix',
  'interfix',
  'diacritical mark',
  'punctuation mark',
  'romanization',
  'han character',
]);

/**
 * Openings that mark a sense as a code, name, or label rather than a meaning.
 * Anchored at the start so a junk word appearing mid-sentence (the science of
 * taxonomic classification) is not demoted. Conservative by design: when in
 * doubt, keep the sense.
 */
const JUNK_OPENINGS: RegExp[] = [
  /^(the )?ISO \d/i, // ISO 639, ISO 4217, ISO 3166 codes
  /^(an? )?(initialism|abbreviation|acronym) of\b/i,
  /^symbol for\b/i,
  /^(an? )?([a-z-]+ )?(male |female |unisex )?given name\b/i,
  /^(an? )?([a-z-]+ )?surname\b/i,
  /^(an? )?([a-z-]+ )?(placename|place name)\b/i,
  /^(an? )?taxonomic\b/i,
  /^(an? )?(genus|species) of\b/i,
];

/**
 * Whether a sense is a reliably-junk one (a language or ISO code, an
 * abbreviation or initialism, a symbol, a taxonomic or genus name, a given name
 * or surname or place name). Demote these; do not pick unless nothing else
 * exists. pos is the lowercased part of speech, text is the cleaned definition.
 */
export function isJunkSense(pos: string | null, text: string): boolean {
  if (pos && JUNK_POS.has(pos)) return true;
  return JUNK_OPENINGS.some((re) => re.test(text));
}

/**
 * The best everyday English sense, cleaned to plain text. Prefers the first
 * sense that is not reliably junk, demoting language codes, abbreviations,
 * symbols, taxonomic and proper names. Falls back to the first usable sense
 * when every sense is flagged, so a genuinely technical word keeps a real
 * definition rather than going blank.
 */
export function selectSense(definitionJson: string | null): FirstSense | null {
  const senses: FirstSense[] = [];
  for (const sense of englishSenses(definitionJson)) {
    const reduced = reduceSense(sense);
    if (reduced) senses.push(reduced);
  }
  if (senses.length === 0) return null;
  const everyday = senses.find((s) => !isJunkSense(s.pos, s.text));
  return everyday ?? senses[0] ?? null;
}

/** Source-pool definition string: "pos. text" or just text. First-sense path. */
export function extractDefinition(
  definitionJson: string | null,
): string | null {
  const sense = firstSense(definitionJson);
  if (!sense) return null;
  return sense.pos ? `${sense.pos}. ${sense.text}` : sense.text;
}

function extractEtymology(etymologyHtml: string | null): string | null {
  if (!etymologyHtml) return null;
  let html = etymologyHtml;
  // Drop maintenance-error spans (ambiguous-etymon notices) entirely.
  html = html.replace(/<span class="error[^>]*>[\s\S]*?<\/span>/gi, ' ');
  // The prose lives in <p> elements; the etymology tree and references are
  // sibling <div>/<ol> blocks, so taking paragraphs alone drops the noise.
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(
    (m) => m[1] ?? '',
  );
  if (paragraphs.length === 0) return null;
  const text = cleanText(paragraphs.join(' '));
  return text || null;
}

// --- Fetch (cached) ------------------------------------------------------

interface RawDefinition {
  definitionJson: string | null;
}

/**
 * Raw REST definition JSON for one word, cached on disk under a definitions-only
 * key so it does not collide with the source-pool etymology cache. A cached null
 * (a throttled miss) is re-fetched rather than trusted, so a busy run never
 * poisons the cache permanently. Network: acquisition only.
 */
export async function fetchDefinitionJson(
  word: string,
): Promise<string | null> {
  const cacheKey = `wiktionary-defs/${word}.json`;
  let cached = await readCacheJson<RawDefinition>(cacheKey);
  if (!cached || cached.definitionJson === null) {
    const enc = encodeURIComponent(word);
    let definitionJson: string | null;
    try {
      definitionJson = await fetchText(
        `https://en.wiktionary.org/api/rest_v1/page/definition/${enc}`,
        { headers: HEADERS },
      );
    } catch {
      definitionJson = null;
    }
    await sleep(REQUEST_DELAY_MS);
    cached = { definitionJson };
    if (definitionJson !== null) await writeCacheJson(cacheKey, cached);
  }
  return cached.definitionJson;
}

async function fetchRaw(word: string): Promise<RawResponses> {
  const enc = encodeURIComponent(word);

  let definitionJson: string | null;
  try {
    definitionJson = await fetchText(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${enc}`,
      { headers: HEADERS },
    );
  } catch {
    definitionJson = null;
  }
  await sleep(REQUEST_DELAY_MS);

  let etymologyHtml: string | null = null;
  try {
    const base = 'https://en.wiktionary.org/w/api.php';
    const sections = JSON.parse(
      await fetchText(
        `${base}?action=parse&page=${enc}&prop=sections&format=json&formatversion=2`,
        { headers: HEADERS },
      ),
    ) as { parse?: { sections?: { index?: string; line?: string }[] } };
    const ety = sections.parse?.sections?.find((s) =>
      s.line?.startsWith('Etymology'),
    );
    if (ety?.index) {
      await sleep(REQUEST_DELAY_MS);
      const body = JSON.parse(
        await fetchText(
          `${base}?action=parse&page=${enc}&section=${ety.index}&prop=text&format=json&formatversion=2&disabletoc=1`,
          { headers: HEADERS },
        ),
      ) as { parse?: { text?: string } };
      etymologyHtml = body.parse?.text ?? null;
    }
  } catch {
    etymologyHtml = null;
  }

  return { word, definitionJson, etymologyHtml };
}

/**
 * Enrich one word. Raw responses are cached on disk; a cached entry whose
 * definition fetch failed (a throttled null) is re-fetched rather than trusted,
 * so a busy run never poisons the cache permanently.
 *
 * KNOWN LIMITATION, deliberately not changed here. The re-fetch guard covers a
 * null definition but not a null etymology, so a cached entry whose etymology
 * fetch was throttled is trusted forever. Measured against the committed cache,
 * that is why words like distance, restrain and integral carry no etymology and
 * so never entered the source pool: re-fetching them returns a full etymology.
 * Widening the guard would be correct, but it would silently admit hundreds of
 * new source words on the next data:build and append that many crowns, so it is
 * a decision of its own rather than a fix to make in passing. Use refetchWord
 * for the handful of words being admitted deliberately.
 */
export async function enrichWord(word: string): Promise<WordEntry> {
  const cacheKey = `wiktionary-raw/${word}.json`;
  let raw = await readCacheJson<RawResponses>(cacheKey);
  if (!raw || raw.definitionJson === null) {
    raw = await fetchRaw(word);
    if (raw.definitionJson !== null) await writeCacheJson(cacheKey, raw);
  }
  return {
    word,
    definition: extractDefinition(raw.definitionJson),
    etymology: extractEtymology(raw.etymologyHtml),
  };
}

/**
 * Enrich one word from the network, ignoring any cached raw response, and
 * refresh the cache with what comes back.
 *
 * Only for deliberate, named admissions to the source pool. It is the way past
 * a cached null etymology, which enrichWord trusts (see above). Scoped to an
 * explicit word list so a rebuild stays reproducible.
 */
export async function refetchWord(word: string): Promise<WordEntry> {
  const raw = await fetchRaw(word);
  if (raw.definitionJson !== null) {
    await writeCacheJson(`wiktionary-raw/${word}.json`, raw);
  }
  return {
    word,
    definition: extractDefinition(raw.definitionJson),
    etymology: extractEtymology(raw.etymologyHtml),
  };
}

/**
 * Copies the site's four typefaces out of Google Fonts into public/fonts, so
 * no page loads anything from Google.
 *
 *   pnpm fonts:fetch
 *
 * Outputs to public/fonts/:
 *   fonts.css, the @font-face rules every page links;
 *   one .woff2 per face and script subset;
 *   OFL-<Family>.txt, each family's licence, which the OFL asks to travel with
 *   the files.
 *
 * The rules are Google's own, as Google served them to a current browser, with
 * only the addresses changed. Each subset keeps its unicode-range, so a browser
 * still downloads only the scripts a page uses, and the etymologies' Greek and
 * Cyrillic still find the glyphs they found before. Run it again only to take a
 * newer release of a family; the files it writes are committed.
 */
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, ensureDir } from './lib/util.ts';

const FONTS_DIR = join(REPO_ROOT, 'public', 'fonts');

/**
 * The families, axes and weights index.html asked for, which is every face any
 * page used: the letterpress pair, Fraunces and Spectral, and the cute pair,
 * Fredoka and Nunito.
 */
const FAMILIES = [
  'Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600',
  'Spectral:ital,wght@0,400;0,500;0,600;1,400;1,500',
  'Fredoka:wght@400;500;600;700',
  'Nunito:ital,wght@0,400;0,600;0,700;1,400',
];

const CSS_URL =
  'https://fonts.googleapis.com/css2?' +
  FAMILIES.map((f) => `family=${f}`).join('&') +
  '&display=swap';

/** Google sends woff2, split by script, only to a browser that reads them. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const licenceUrl = (family: string): string =>
  `https://raw.githubusercontent.com/google/fonts/main/ofl/${family.toLowerCase()}/OFL.txt`;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const css = await fetchText(CSS_URL);
  const blocks = [
    ...css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]*)\}/g),
  ];
  if (blocks.length === 0)
    throw new Error('No @font-face rules in the response');

  await ensureDir(FONTS_DIR);
  for (const name of await readdir(FONTS_DIR)) {
    if (name.endsWith('.woff2')) await rm(join(FONTS_DIR, name));
  }

  const parsed = blocks.map(([, subset, body]) => {
    const field = (name: string): string => {
      const m = body!.match(new RegExp(`${name}: ([^;]+);`));
      if (!m) throw new Error(`A ${subset} rule has no ${name}`);
      return m[1]!.trim();
    };
    return {
      subset: subset!,
      body: body!,
      family: field('font-family').replace(/'/g, ''),
      style: field('font-style'),
      weights: field('font-weight').split(/\s+/).map(Number),
      url: field('src').match(/url\(([^)]+)\)/)![1]!,
    };
  });

  // One file per address. Google points several weights of a variable face at
  // the same file, so the file is named for every weight its rules give it.
  const files = new Map<string, string>();
  for (const rule of parsed) {
    if (files.has(rule.url)) continue;
    const weights = parsed
      .filter((r) => r.url === rule.url)
      .flatMap((r) => r.weights);
    const low = Math.min(...weights);
    const high = Math.max(...weights);
    const weight = low === high ? `${low}` : `${low}-${high}`;
    const file =
      `${rule.family}-${rule.style}-${weight}-${rule.subset}.woff2`.toLowerCase();
    const res = await fetch(rule.url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`${rule.url}: HTTP ${res.status}`);
    await writeFile(
      join(FONTS_DIR, file),
      Buffer.from(await res.arrayBuffer()),
    );
    files.set(rule.url, file);
  }
  const rules = parsed.map(
    (r) =>
      `/* ${r.subset} */\n@font-face {${r.body.replace(r.url, `/fonts/${files.get(r.url)}`)}}`,
  );

  const header = `/*
 * The site's typefaces, served from the site. Written by
 * scripts/fetch-fonts.ts from Google Fonts on ${new Date().toISOString().slice(0, 10)},
 * with only the addresses changed. Each family's licence is beside it, as
 * OFL-<Family>.txt.
 */
`;
  await writeFile(
    join(FONTS_DIR, 'fonts.css'),
    header + rules.join('\n') + '\n',
  );

  for (const family of ['Fraunces', 'Spectral', 'Fredoka', 'Nunito']) {
    await writeFile(
      join(FONTS_DIR, `OFL-${family}.txt`),
      await fetchText(licenceUrl(family)),
    );
  }
  console.log(`${rules.length} rules, ${files.size} files, 4 licences`);
}

await main();

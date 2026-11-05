/**
 * The way back: edited costume files into both apps' costume tables.
 *
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/illustrations/import.ts \
 *     <costume file>... --ios <iOS repo> [--dry-run] [--no-guards] \
 *     [--allow-new-parts] [--allow-deleted-parts] [--allow-reference-changes]
 *
 * Each file is named for its costume, as the export names it. Parts are found
 * by their labels and taken in the file's order, at one decimal. Anything the
 * tables can't hold stops the whole import, before anything is written, with
 * each problem named. Otherwise it writes the web's `costumes.ts` and its
 * labels here, iOS's `Costumes.swift` there, moves `COSTUME_TABLE_SHA256` in
 * both repos together, and runs both repos' costume guards: the footprint, the
 * parsing, and the hash.
 *
 * A file with no edits writes nothing. Alternates have no table (answer 9 of
 * the illustrations report): they stay files.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import * as prettier from 'prettier';
import {
  canonicalCostumeTable,
  COSTUME_ORDER,
  COSTUMES,
  type CostumeId,
  type CostumePart,
} from '@/ui/costumes.ts';
import { costumeFile } from './export.ts';
import { plan, readFile, type Flags, type Plan } from './importer.ts';
import { COSTUME_LABELS } from './labels.ts';
import {
  writeCostumesSwift,
  writeCostumesTs,
  writeHash,
  writeLabelsTs,
} from './writers.ts';

const WEB = resolve(import.meta.dirname, '../..');

async function formatted(path: string, text: string): Promise<string> {
  const options = await prettier.resolveConfig(path);
  return prettier.format(text, { ...options, filepath: path });
}

/** Writes a file only if its text changed, and says so. */
function save(path: string, before: string, after: string, wrote: string[]) {
  if (before === after) return;
  writeFileSync(path, after);
  wrote.push(path);
}

function guard(
  name: string,
  cwd: string,
  cmd: string,
  args: string[],
): boolean {
  try {
    execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
    console.log(`  ${name}: passed`);
    return true;
  } catch (e) {
    const out = e as { stdout?: string; stderr?: string };
    const lines = `${out.stdout ?? ''}${out.stderr ?? ''}`.split('\n');
    const failing = lines
      .filter((l) => /✘|FAIL|×|Expected|Received|expect/.test(l))
      .slice(0, 12);
    console.log(`  ${name}: FAILED`);
    for (const l of failing) console.log(`    ${l.trim()}`);
    return false;
  }
}

async function main(argv: string[]) {
  const files = argv.filter(
    (a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--ios',
  );
  const iosAt = argv.indexOf('--ios');
  const ios = iosAt < 0 ? undefined : argv[iosAt + 1];
  const dryRun = argv.includes('--dry-run');
  const flags: Flags = {
    allowNewParts: argv.includes('--allow-new-parts'),
    allowDeletedParts: argv.includes('--allow-deleted-parts'),
    allowReferenceChanges: argv.includes('--allow-reference-changes'),
  };
  if (!files.length || (!ios && !dryRun))
    throw new Error(
      'usage: import.ts <costume file>... --ios <iOS repo> [--dry-run] [--allow-...]',
    );

  const original = new Map(
    COSTUME_ORDER.map((id) => [id, [...COSTUMES[id].parts]]),
  );
  const old = (id: CostumeId): readonly CostumePart[] => original.get(id)!;
  const plans: Plan[] = [];
  let stopped = false;
  for (const file of files) {
    const id = basename(file, '.svg') as CostumeId;
    console.log(`\n${file}`);
    if (!COSTUME_ORDER.includes(id)) {
      console.log(
        `  STOP: "${id}" is not a costume in the table. Alternates stay files.`,
      );
      stopped = true;
      continue;
    }
    const p = plan(
      id,
      readFile(readFileSync(file, 'utf8')),
      readFile(costumeFile(id).svg),
      old(id),
      COSTUME_LABELS[id],
      flags,
    );
    for (const s of p.problems) console.log(`  STOP: ${s}`);
    for (const s of p.notes) console.log(`  note: ${s}`);
    for (const s of p.changes) console.log(`  ${s}`);
    if (!p.problems.length && !p.changes.length)
      console.log('  nothing changed');
    if (p.problems.length) stopped = true;
    plans.push(p);
  }
  if (stopped) {
    console.log('\nStopped: nothing was written.');
    process.exitCode = 1;
    return;
  }
  const changed = plans.filter((p) => p.changes.length);
  if (!changed.length) {
    console.log('\nNothing changed, so nothing was written.');
    return;
  }

  const was = createHash('sha256')
    .update(canonicalCostumeTable())
    .digest('hex');
  for (const p of changed)
    (COSTUMES[p.id] as { parts: readonly CostumePart[] }).parts = p.parts;
  const hash = createHash('sha256')
    .update(canonicalCostumeTable())
    .digest('hex');
  console.log(`\nCOSTUME_TABLE_SHA256: ${was}\n                   to ${hash}`);
  if (dryRun) {
    console.log('A dry run: nothing was written.');
    return;
  }

  const wrote: string[] = [];
  const at = {
    ts: join(WEB, 'src/ui/costumes.ts'),
    labels: join(WEB, 'scripts/illustrations/labels.ts'),
    webTest: join(WEB, 'src/ui/costumes.test.ts'),
    swift: join(ios!, 'Sources/PeachEngine/Costumes.swift'),
    iosTest: join(ios!, 'Tests/PeachEngineTests/CostumeTests.swift'),
  };
  const text = Object.fromEntries(
    Object.entries(at).map(([k, path]) => [k, readFileSync(path, 'utf8')]),
  ) as Record<keyof typeof at, string>;
  save(
    at.ts,
    text.ts,
    await formatted(at.ts, writeCostumesTs(text.ts, changed, old)),
    wrote,
  );
  save(
    at.labels,
    text.labels,
    await formatted(at.labels, writeLabelsTs(text.labels, changed)),
    wrote,
  );
  save(
    at.webTest,
    text.webTest,
    writeHash(text.webTest, 'COSTUME_TABLE_SHA256', hash),
    wrote,
  );
  save(
    at.swift,
    text.swift,
    writeCostumesSwift(text.swift, changed, old),
    wrote,
  );
  save(
    at.iosTest,
    text.iosTest,
    writeHash(text.iosTest, 'tableSHA256', hash),
    wrote,
  );
  console.log('\nWrote:');
  for (const w of wrote) console.log(`  ${w}`);

  if (argv.includes('--no-guards')) return;
  console.log('\nThe guards:');
  const web = guard('web, costumes.test.ts', WEB, 'pnpm', [
    'exec',
    'vitest',
    'run',
    'src/ui/costumes.test.ts',
  ]);
  const iOS = guard('iOS, CostumeTests', ios!, 'swift', [
    'test',
    '--filter',
    'CostumeTests',
  ]);
  if (!web || !iOS) process.exitCode = 1;
}

await main(process.argv.slice(2));

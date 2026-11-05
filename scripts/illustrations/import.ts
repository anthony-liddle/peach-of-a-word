/**
 * The way back: edited illustrations into both apps.
 *
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/illustrations/import.ts \
 *     <file>... --ios <iOS repo> [--dry-run] [--no-guards] \
 *     [--allow-new-parts] [--allow-deleted-parts] [--allow-reference-changes] \
 *     [--draw-on-its-own]
 *
 * Each file is named as the export names it: a costume's, `peach.svg`, or one
 * of the growing peach's stages. Parts are found by their labels and taken in
 * the file's order, at one decimal. Anything the tables can't hold stops the
 * whole import, before anything is written, with each problem named.
 *
 * - **A costume** goes into the web's `costumes.ts` and iOS's `Costumes.swift`.
 * - **The peach** goes into the web's `peachArt.ts` and its tab icon, and into
 *   the growth table's generator, `tools/growth-stages.py` in iOS, from which
 *   both apps' peach is drawn. The stages and the costumes drawn from the peach
 *   follow it. `stage-6-perfectly-peachy.svg` is the peach itself, so an edit
 *   there is the peach's.
 * - **A stage** goes into the generator as literal path data in place of its
 *   formula (answer 6). The crown's own parts can change while the peach under
 *   it goes on following the peach. A stage drawn from the peach stops
 *   following it only when the generator's `DRAWN_ON_THEIR_OWN` names it:
 *   an edit to its peach stops the import, unless `--draw-on-its-own` says to
 *   name it there (Antoine, 4 November 2026). `GrowthStageTests` holds every
 *   other stage drawn from the peach to today's peach.
 *
 * The generator is run on a copy first, so a stage outside its box stops the
 * import with nothing written. Then it writes, moves every pinned hash that
 * moved in both repos together, and runs both repos' tests. If one fails,
 * every file it wrote is put back as it was.
 *
 * When those pass, each file in the vault that shows what changed, and has no
 * edits of its own, is exported again: a costume's peach underneath, the
 * stages that follow the peach. The home-screen icons, the link-preview card,
 * the App Store icon, the store art and the screenshots are never touched:
 * the import lists them as out of date, and `redraw.ts` redraws the icons and
 * the store art only when Antoine asks (4 November 2026).
 *
 * A file with no edits writes nothing. Alternates have no table (answer 9 of
 * the illustrations report): they stay files.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import * as prettier from 'prettier';
import {
  canonicalCostumeTable,
  COSTUME_ORDER,
  COSTUMES,
  type CostumeId,
  type CostumePart,
} from '@/ui/costumes.ts';
import { PEACH_BODY, PEACH_FACE, type PeachPart } from '@/ui/peachArt.ts';
import {
  canonicalGrowthTable,
  GROWTH_STAGES,
} from '@/storeArt/growthStages.ts';
import { faviconCuteSvg, ICON_PEACH } from '../lib/icons.ts';
import { circlePath, formatPath } from './pathData.ts';
import {
  allEntries,
  costumeFile,
  peachFile,
  stageFile,
  STAGE_FILES,
  type Candidate,
} from './export.ts';
import {
  PEACH_FOLLOWED,
  PEACH_PART_LABELS,
  peachProblems,
  peachTable,
  plan,
  readFile,
  sameDrawing,
  sameOutline,
  type Flags,
  type Plan,
} from './importer.ts';
import { COSTUME_LABELS, STAGE_LABELS } from './labels.ts';
import {
  writeCostumesSwift,
  writeCostumesTs,
  writeGrowthStagesTs,
  peachArtParts,
  writeHash,
  writeLabelsTs,
  writePeachArtTs,
  writePeachPy,
  writeStagePy,
  WriteError,
  type StageJson,
} from './writers.ts';

const WEB = resolve(import.meta.dirname, '../..');
const KEYS = [
  'd',
  'fill',
  'opacity',
  'stroke',
  'strokeWidth',
  'faceOnly',
] as const;

/** Whether two parts draw the same: the same outline at one decimal, the same paint. */
const samePart = (a: CostumePart, b: CostumePart) =>
  sameOutline(a.d, b.d) &&
  KEYS.slice(1).every((k) => (a[k] || undefined) === (b[k] || undefined));

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const circleD = (c: readonly [number, number, number]) =>
  formatPath(circlePath(c[0], c[1], c[2]));

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
    // Vitest marks a failure ×, Swift Testing ✘, and either names it FAIL.
    const failing = lines.filter((l) => /✘|×|FAIL|AssertionError/.test(l));
    console.log(`  ${name}: FAILED`);
    for (const l of failing.slice(0, 12)) console.log(`    ${l.trim()}`);
    if (failing.length > 12)
      console.log(`    and ${failing.length - 12} lines more`);
    return false;
  }
}

/** What a file is, by its name as the export gave it. */
type Kind =
  | { kind: 'costume'; id: CostumeId }
  | { kind: 'peach'; via: 'peach' | 'perfectly-peachy' }
  | { kind: 'stage'; id: string };

function kindOf(file: string): Kind | undefined {
  const name = basename(file, '.svg');
  if ((COSTUME_ORDER as readonly string[]).includes(name))
    return { kind: 'costume', id: name as CostumeId };
  if (name === 'peach') return { kind: 'peach', via: 'peach' };
  const stage = Object.keys(STAGE_FILES).find((k) => STAGE_FILES[k] === name);
  if (stage === 'perfectly-peachy')
    return { kind: 'peach', via: 'perfectly-peachy' };
  return stage ? { kind: 'stage', id: stage } : undefined;
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
  if (!files.length || !ios)
    throw new Error(
      'usage: import.ts <file>... --ios <iOS repo> [--dry-run] [--allow-...] [--draw-on-its-own]',
    );

  // MARK: Plans, one for each file, before anything is written.

  const originalCostumes = new Map(
    COSTUME_ORDER.map((id) => [id, [...COSTUMES[id].parts]]),
  );
  const oldCostume = (id: string): readonly CostumePart[] =>
    originalCostumes.get(id as CostumeId)!;
  const peachWas = peachTable();
  const costumePlans: Plan[] = [];
  const peachPlans: { file: string; plan: Plan }[] = [];
  const stagePlans: Plan[] = [];
  let stopped = false;
  const say = (p: Plan) => {
    for (const s of p.problems) console.log(`  STOP: ${s}`);
    for (const s of p.notes) console.log(`  note: ${s}`);
    for (const s of p.changes) console.log(`  ${s}`);
    if (!p.problems.length && !p.changes.length)
      console.log('  nothing changed');
    if (p.problems.length) stopped = true;
  };
  for (const file of files) {
    console.log(`\n${file}`);
    const k = kindOf(file);
    const svg = readFileSync(file, 'utf8');
    if (!k) {
      console.log(
        basename(dirname(resolve(file))) === 'Alternates'
          ? '  STOP: alternates have no table, so they stay files (answer 9).'
          : `  STOP: "${basename(file, '.svg')}" is not a drawing the import takes yet: ` +
              'it takes the costumes, peach.svg and the stages.',
      );
      stopped = true;
      continue;
    }
    if (k.kind === 'costume') {
      const p = plan(
        k.id,
        readFile(svg),
        readFile(costumeFile(k.id).svg),
        oldCostume(k.id),
        COSTUME_LABELS[k.id],
        flags,
      );
      say(p);
      costumePlans.push(p);
    } else if (k.kind === 'peach') {
      const labels =
        k.via === 'peach'
          ? PEACH_PART_LABELS
          : STAGE_LABELS['perfectly-peachy']!;
      if (labels.join('\n') !== PEACH_PART_LABELS.join('\n'))
        throw new Error("Perfectly Peachy's labels are not the peach's");
      const p = plan(
        'peach',
        readFile(svg),
        readFile(
          (k.via === 'peach' ? peachFile() : stageFile('perfectly-peachy')).svg,
        ),
        peachWas,
        labels,
        flags,
        new Map(),
      );
      p.problems.push(...peachProblems(p));
      if (p.problems.length) p.changes = [];
      if (k.via === 'perfectly-peachy' && p.changes.length)
        p.notes.push(
          "Perfectly Peachy is the peach itself, so this edit is the peach's, and goes " +
            'everywhere an edit to peach.svg would',
        );
      say(p);
      peachPlans.push({ file, plan: p });
    } else {
      const stage = GROWTH_STAGES.find((s) => s.id === k.id)!;
      const p = plan(
        k.id,
        readFile(svg),
        readFile(stageFile(k.id).svg),
        stage.parts,
        STAGE_LABELS[k.id]!,
        flags,
        new Map(),
      );
      say(p);
      stagePlans.push(p);
    }
  }

  // peach.svg and Perfectly Peachy are one peach: two different edits stop.
  const peachEdits = peachPlans.filter((e) => e.plan.changes.length);
  if (
    peachEdits.length > 1 &&
    peachEdits.some((e) =>
      e.plan.parts.some(
        (part, i) => !samePart(part, peachEdits[0]!.plan.parts[i]!),
      ),
    )
  ) {
    console.log(
      `\nSTOP: ${peachEdits.map((e) => basename(e.file)).join(' and ')} are the same peach, ` +
        'edited two different ways. Keep one edit, and import that file alone.',
    );
    stopped = true;
  }
  if (stopped) {
    console.log('\nStopped: nothing was written.');
    process.exitCode = 1;
    return;
  }
  const costumesChanged = costumePlans.filter((p) => p.changes.length);
  const stagesChanged = stagePlans.filter((p) => p.changes.length);
  const peach = peachEdits[0]?.plan;
  if (!costumesChanged.length && !stagesChanged.length && !peach) {
    console.log('\nNothing changed, so nothing was written.');
    return;
  }

  // MARK: The new text of every file, in memory.

  const at = {
    costumesTs: join(WEB, 'src/ui/costumes.ts'),
    labels: join(WEB, 'scripts/illustrations/labels.ts'),
    costumesTest: join(WEB, 'src/ui/costumes.test.ts'),
    peachArt: join(WEB, 'src/ui/peachArt.ts'),
    favicon: join(WEB, 'public/favicon-cute.svg'),
    growthTs: join(WEB, 'src/storeArt/growthStages.ts'),
    growthTest: join(WEB, 'src/storeArt/growthStages.test.ts'),
    costumesSwift: join(ios, 'Sources/PeachEngine/Costumes.swift'),
    costumeTests: join(ios, 'Tests/PeachEngineTests/CostumeTests.swift'),
    growthPy: join(ios, 'tools/growth-stages.py'),
    growthSwift: join(ios, 'Sources/PeachEngine/GrowthStages.swift'),
    growthTests: join(ios, 'Tests/PeachEngineTests/GrowthStageTests.swift'),
  };
  const was = Object.fromEntries(
    Object.entries(at).map(([k, path]) => [k, readFileSync(path, 'utf8')]),
  ) as Record<keyof typeof at, string>;
  const now = { ...was };

  if (costumesChanged.length) {
    now.costumesTs = await formatted(
      at.costumesTs,
      writeCostumesTs(was.costumesTs, costumesChanged, oldCostume),
    );
    now.costumesSwift = writeCostumesSwift(
      was.costumesSwift,
      costumesChanged,
      oldCostume,
    );
  }
  now.labels = writeLabelsTs(was.labels, costumesChanged);
  now.labels = writeLabelsTs(
    now.labels,
    stagesChanged,
    'STAGE_LABELS',
    (id) => STAGE_LABELS[id],
  );
  if (now.labels !== was.labels)
    now.labels = await formatted(at.labels, now.labels);

  // The peach, in the web's own form, and its tab icon.
  let gamePeach: readonly PeachPart[] = [...PEACH_BODY, ...PEACH_FACE];
  if (peach) {
    gamePeach = peachArtParts(peach.parts, peachWas, gamePeach);
    now.peachArt = await formatted(
      at.peachArt,
      writePeachArtTs(was.peachArt, peach.parts, peachWas),
    );
    now.favicon = faviconCuteSvg(gamePeach);
  }

  // The generator: the peach and each edited stage, run on a copy.
  const today = new Date().toLocaleDateString('en-CA');
  const drawnOnItsOwn: string[] = [];
  if (peach) now.growthPy = writePeachPy(now.growthPy, peach.parts, peachWas);
  for (const p of stagesChanged) {
    const stage = GROWTH_STAGES.find((s) => s.id === p.id)!;
    const w = writeStagePy(
      now.growthPy,
      stage,
      p,
      stage.parts,
      today,
      argv.includes('--draw-on-its-own'),
    );
    now.growthPy = w.text;
    if (w.drawnOnItsOwn) drawnOnItsOwn.push(stage.spoken);
  }
  let table: StageJson[] = GROWTH_STAGES.map((s) => ({
    id: s.id,
    spoken: s.spoken,
    parts: [...s.parts],
  }));
  if (now.growthPy !== was.growthPy) {
    const copy = mkdtempSync(join(tmpdir(), 'growth-stages-'));
    mkdirSync(join(copy, 'tools'));
    mkdirSync(join(copy, 'Sources/PeachEngine'), { recursive: true });
    writeFileSync(join(copy, 'tools/growth-stages.py'), now.growthPy);
    let printed: string;
    try {
      printed = execFileSync(
        'python3',
        [
          '-I',
          join(copy, 'tools/growth-stages.py'),
          '--json',
          join(copy, 'stages.json'),
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (e) {
      const out = e as { stdout?: string; stderr?: string };
      console.log(
        `\nSTOP: the growth table's generator refused it:\n  ${`${out.stderr ?? ''}${out.stdout ?? ''}`.trim().split('\n').slice(-3).join('\n  ')}`,
      );
      console.log('\nStopped: nothing was written.');
      process.exitCode = 1;
      return;
    }
    table = JSON.parse(readFileSync(join(copy, 'stages.json'), 'utf8'));
    now.growthSwift = readFileSync(
      join(copy, 'Sources/PeachEngine/GrowthStages.swift'),
      'utf8',
    );
    const hash = /sha256 ([0-9a-f]{64})/.exec(printed)?.[1];
    if (!hash || sha(canonicalGrowthTable(table)) !== hash) {
      console.log(
        "\nSTOP: the generator's table and the web's reading of it hash differently, so the " +
          "two apps would disagree. Nothing was written; this is the import's fault, not the drawing's.",
      );
      process.exitCode = 1;
      return;
    }
    now.growthTs = await formatted(
      at.growthTs,
      writeGrowthStagesTs(
        was.growthTs,
        table,
        GROWTH_STAGES.map((s) => ({ ...s, parts: [...s.parts] })),
        new Map(stagesChanged.map((p) => [p.id, p])),
      ),
    );
  }

  // MARK: The vault, as the export draws it now, to tell what an edit moves.
  // Taken before the costumes below are moved onto the peach's new outlines,
  // so it is the code as it was.

  const vault = dirname(dirname(resolve(files[0]!)));
  const project = dirname(vault);
  const candidatesAt = join(
    project,
    'reports/assets/2026-10-29/winter/source/candidates.json',
  );
  const calendarAt = join(vault, 'Marks And Details/calendar-found-day.svg');
  const cell = existsSync(calendarAt)
    ? /id="cell"[^>]*\sd="([^"]+)"|\sd="([^"]+)"[^>]*id="cell"/.exec(
        readFileSync(calendarAt, 'utf8'),
      )
    : null;
  const inputs = {
    ...(existsSync(candidatesAt)
      ? {
          candidates: JSON.parse(
            readFileSync(candidatesAt, 'utf8'),
          ) as Candidate[],
        }
      : {}),
    ...(cell ? { cell: (cell[1] ?? cell[2])! } : {}),
  };
  const before = new Map(
    dryRun
      ? []
      : allEntries(inputs).entries.map((e) => [
          `${e.folder}/${e.name}.svg`,
          e.svg,
        ]),
  );

  // The hashes both repos pin.
  const growthWas = sha(canonicalGrowthTable());
  const growthNow = sha(canonicalGrowthTable(table));
  const costumeWas = sha(canonicalCostumeTable());
  const pp = table.find((s) => s.id === 'perfectly-peachy')!.parts;
  const outline: Record<string, string> = {
    leaf: pp[0]!.d,
    body: pp[1]!.d,
    highlight: pp[2]!.d,
  };
  const follow = (parts: readonly CostumePart[]) =>
    parts.map((p) =>
      PEACH_FOLLOWED.has(p.d)
        ? { ...p, d: outline[PEACH_FOLLOWED.get(p.d)!]! }
        : p,
    );
  for (const p of costumesChanged)
    (COSTUMES[p.id as CostumeId] as { parts: readonly CostumePart[] }).parts =
      p.parts;
  for (const id of COSTUME_ORDER)
    (COSTUMES[id] as { parts: readonly CostumePart[] }).parts = follow(
      COSTUMES[id].parts,
    );
  const costumeNow = sha(canonicalCostumeTable());
  if (growthNow !== growthWas) {
    now.growthTest = writeHash(
      now.growthTest,
      'GROWTH_TABLE_SHA256',
      growthNow,
    );
    now.growthTests = writeHash(now.growthTests, 'tableSHA256', growthNow);
    console.log(
      `\nThe growth table's hash: ${growthWas}\n                     to ${growthNow}`,
    );
  }
  if (costumeNow !== costumeWas) {
    now.costumesTest = writeHash(
      now.costumesTest,
      'COSTUME_TABLE_SHA256',
      costumeNow,
    );
    now.costumeTests = writeHash(now.costumeTests, 'tableSHA256', costumeNow);
    console.log(
      `\nCOSTUME_TABLE_SHA256: ${costumeWas}\n                   to ${costumeNow}`,
    );
  }
  if (peach) {
    const moved = GROWTH_STAGES.filter(
      (s) =>
        s.id !== 'perfectly-peachy' &&
        !stagesChanged.some((p) => p.id === s.id) &&
        !s.parts.every((part, i) => {
          const n = table.find((t) => t.id === s.id)!.parts[i];
          return n !== undefined && samePart(part, n);
        }),
    );
    console.log(
      `\nThe peach changed. It carries to both games' peach, the web's tab icon` +
        (moved.length
          ? `, the stages that follow it (${moved.map((s) => s.spoken).join(', ')})`
          : '') +
        (costumeNow !== costumeWas
          ? ', and the costumes drawn on its outlines'
          : '') +
        '.',
    );
  }
  for (const s of drawnOnItsOwn)
    console.log(
      `\nThe stage "${s}" is drawn on its own from now on, named in the generator's ` +
        "DRAWN_ON_THEIR_OWN: a later edit to the peach won't reach it.",
    );
  if (dryRun) {
    console.log('\nA dry run: nothing was written.');
    return;
  }

  // MARK: Writing.

  const wrote: string[] = [];
  for (const k of Object.keys(at) as (keyof typeof at)[])
    save(at[k], was[k], now[k], wrote);
  console.log('\nWrote:');
  for (const w of wrote) console.log(`  ${w}`);

  // MARK: The guards: both repos' tests, whole.

  // The vault is brought up to date only after the guards pass, judged against
  // the code as it was before this run. A second run on top of this one finds
  // the code already matching the drawing, so it says nothing changed and
  // never reaches the vault: the code has to be as it was for the vault to
  // follow.
  if (argv.includes('--no-guards')) {
    console.log(
      '\nThe guards were not run, so the vault was left as it is. To finish, discard what ' +
        'this wrote in both repos (the files under "Wrote:"), and import again without ' +
        '--no-guards. Run on top of this, the import finds nothing changed.',
    );
    return;
  }
  console.log('\nThe guards:');
  const web = guard('web, every test', WEB, 'pnpm', ['exec', 'vitest', 'run']);
  const iOS = guard('iOS, every test', ios, 'swift', ['test']);
  if (!web || !iOS) {
    process.exitCode = 1;
    for (const k of Object.keys(at) as (keyof typeof at)[])
      if (wrote.includes(at[k])) writeFileSync(at[k], was[k]);
    console.log(
      '\nA guard failed, so every file the import wrote is back as it was, in both repos, ' +
        'and the vault is as it was. Fix what the guard names, and import it again. ' +
        'To look at the failing state, import with --no-guards.',
    );
    return;
  }

  // MARK: The vault's files that show what moved, exported again.

  const out = mkdtempSync(join(tmpdir(), 'illustrations-'));
  const cellFile = join(out, 'cell.txt');
  if (inputs.cell) writeFileSync(cellFile, inputs.cell);
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      '--tsconfig',
      'tsconfig.app.json',
      'scripts/illustrations/export.ts',
      out,
      ...(inputs.candidates ? ['--candidates', candidatesAt] : []),
      ...(inputs.cell ? ['--cell', cellFile] : []),
    ],
    { cwd: WEB, stdio: 'pipe' },
  );
  const imported = new Set(files.map((f) => resolve(f)));
  const refreshed: string[] = [];
  const keptAsIs: string[] = [];
  for (const [path, old] of before) {
    const fresh = readFileSync(join(out, path), 'utf8');
    const there = join(vault, path);
    if (fresh === old || imported.has(there) || !existsSync(there)) continue;
    if (sameDrawing(readFileSync(there, 'utf8'), old)) {
      writeFileSync(there, fresh);
      refreshed.push(path);
    } else keptAsIs.push(path);
  }
  if (refreshed.length) {
    console.log('\nExported again in the vault, since they show what changed:');
    for (const r of refreshed) console.log(`  ${r}`);
  }
  if (keptAsIs.length) {
    console.log(
      '\nLeft as they are, with edits of their own the code does not have yet. Import ' +
        'them, or export them again by hand once their edits are kept elsewhere:',
    );
    for (const k of keptAsIs) console.log(`  ${k}`);
  }
  if (!inputs.candidates)
    console.log(
      `\nThe alternates were not checked: no candidates.json at ${candidatesAt}.`,
    );

  // MARK: What is out of date, and is left for Antoine to ask for.

  const stale: string[] = [];
  // The icons show ICON_PEACH; the game draws gamePeach. A circle reads as
  // the path the growth table draws it with.
  const outlineOf = (q: PeachPart) => (q.circle ? circleD(q.circle) : q.d!);
  const iconsBehind =
    ICON_PEACH.length !== gamePeach.length ||
    gamePeach.some((g, i) => {
      const icon = ICON_PEACH[i]!;
      return (
        !sameOutline(outlineOf(g), outlineOf(icon)) ||
        g.fill !== icon.fill ||
        g.opacity !== icon.opacity ||
        g.stroke !== icon.stroke ||
        g.strokeWidth !== icon.strokeWidth
      );
    });
  if (iconsBehind)
    stale.push(
      'The home-screen icons, the link-preview card (og.png) and the App Store icon ' +
        'show the peach before this edit. Redraw them when you choose: ' +
        'scripts/illustrations/redraw.ts --out <dir>',
    );
  if (peach || stagesChanged.length) {
    stale.push(
      'The store art, stills and videos, shows the peach and its stages as they were. ' +
        'Redraw it when you choose: scripts/illustrations/redraw.ts --out <dir> --store-art',
    );
    stale.push(
      "The App Store screenshots show the peach as it was: they're retaken by hand, " +
        'as the Submission Kit says.',
    );
  }
  if (refreshed.length || wrote.length)
    stale.push(
      `The vault's contact-sheet.png shows the files as they were: check/contact.py draws it again.`,
    );
  if (stale.length) {
    console.log('\nOut of date, and left for you to ask for:');
    for (const s of stale) console.log(`  - ${s}`);
  }
}

// A writer that can't find its place stops the import before anything is
// written: every file's new text is worked out before the first is saved.
try {
  await main(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof WriteError)) throw e;
  console.log(`\nSTOP: ${e.message}.\n\nStopped: nothing was written.`);
  process.exitCode = 1;
}

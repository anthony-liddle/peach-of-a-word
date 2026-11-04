/**
 * The name of every part, by which the way back finds it in a file.
 *
 * The code has no names for parts, only comments, so these were read off the
 * comments, in each table's order. Left and right are as seen on screen. The
 * import (import.ts) rewrites a costume's list here when its parts are added,
 * removed or reordered, so the next export labels them alike.
 */
import type { CostumeId } from '@/ui/costumes.ts';

/** Labels for the peach's parts, in PEACH_BODY then PEACH_FACE order. */
export const PEACH_LABELS = {
  body: ['leaf', 'body', 'highlight'],
  face: ['eye, left', 'eye, right', 'cheek, left', 'cheek, right', 'smile'],
} as const;

/**
 * The costumes' parts have no names in the code, only comments, so these are
 * read off the comments in costumes.ts, in the table's order. Left and right
 * are as seen on screen.
 */
export const COSTUME_LABELS: Record<CostumeId, readonly string[]> = {
  'witch-hat': ['cone', 'fold', 'band', 'brim', 'brim edge', 'star'],
  lantern: [
    'deeper orange',
    'rib, left',
    'rib, right',
    'rib, middle',
    'stem',
    'eye, left',
    'eye, right',
    'nose',
    'grin',
  ],
  ghost: [
    'sheet',
    'leaf',
    'eye hole, left',
    'eye hole, right',
    'oo',
    'blush, left',
    'blush, right',
  ],
  'pie-crust': [
    'dish side',
    'filling',
    'lattice across, top',
    'lattice across, bottom',
    'lattice down 1',
    'lattice down 2',
    'lattice down 3',
    'lattice down 4',
    'rim',
    'dome edge',
  ],
  beanie: [
    'dome',
    'dome rib 1',
    'dome rib 2',
    'dome rib 3',
    'dome rib 4',
    'dome rib 5',
    'cuff',
    'cuff rib 1',
    'cuff rib 2',
    'cuff rib 3',
    'cuff rib 4',
    'cuff rib 5',
    'cuff rib 6',
    'cuff rib 7',
    'cuff rib 8',
    'cuff rib 9',
    'cuff fold',
    'pompom',
    'scarf',
    'scarf tail',
    'scarf stripe',
    'scarf edge',
  ],
  antlers: [
    'beam, left',
    'beam, right',
    'tine out, left',
    'tine out, right',
    'tine up, left',
    'tine up, right',
    'ear, left',
    'ear, right',
    'inner ear, left',
    'inner ear, right',
    'nose',
    'nose glint',
  ],
  'santa-hat': ['hat', 'hat fold', 'fur trim', 'pompom'],
  'top-hat': [
    'brim',
    'hat crown',
    'band',
    'hat crown edge',
    'brim edge',
    'sparkle',
  ],
};

const FACE = PEACH_LABELS.face;
const PEACH_STAGE = [...PEACH_LABELS.body, ...FACE];
const PETALS = [
  'top',
  'upper right',
  'lower right',
  'lower left',
  'upper left',
];

/** The growing peach's parts, named from tools/growth-stages.py in iOS. */
export const STAGE_LABELS: Record<string, readonly string[]> = {
  'first-sprout': [
    'stem',
    'leaf, left',
    'leaf, right',
    'soil',
    'soil line',
    'eye, left',
    'eye, right',
    'smile',
  ],
  'little-bud': [
    'stem',
    'leaf, left',
    'leaf, right',
    'bud',
    'bud crease',
    'calyx',
    'eye, left',
    'eye, right',
    'smile',
  ],
  blossom: [
    'leaf',
    ...PETALS.map((p) => `petal, ${p}`),
    ...PETALS.map((p) => `petal shade, ${p}`),
    'centre',
    'eye, left',
    'eye, right',
    'smile',
  ],
  ripening: PEACH_STAGE,
  sweet: PEACH_STAGE,
  'perfectly-peachy': PEACH_STAGE,
  crown: [
    ...PEACH_STAGE.slice(1),
    'crown',
    'crown band',
    'jewel, left',
    'jewel, middle',
    'jewel, right',
  ],
};

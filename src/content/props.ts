import type { Interaction, PropDef, PropState } from '../types.ts';
import { strings } from './strings.he.ts';

type Name = keyof typeof strings.props;

interface Spec {
  art: string;
  layer?: PropDef['layer'];
  draggable?: boolean;
  interactions?: Interaction[];
  artStates?: PropDef['artStates'];
  useOnPoint?: PropDef['useOnPoint'];
  letter?: PropDef['letter'];
}

/** Items are draggable unless they say otherwise; furniture is fixed. */
function prop(id: string, name: Name, spec: Spec): PropDef {
  const layer = spec.layer ?? 'item';
  return {
    id,
    nameHe: strings.props[name],
    voiceLine: `prop.${id}`,
    art: spec.art,
    layer,
    draggable: spec.draggable ?? layer === 'item',
    interactions: spec.interactions ?? [],
    ...(spec.artStates ? { artStates: spec.artStates } : {}),
    ...(spec.useOnPoint ? { useOnPoint: spec.useOnPoint } : {}),
    ...(spec.letter ? { letter: spec.letter } : {}),
  };
}

const toggle = (key: string): Interaction[] => [{ type: 'toggle', key }];
const when = (state: PropState, art: string, frames?: string[]) => [
  frames ? { when: state, art, frames } : { when: state, art },
];

const definitions: PropDef[] = [
  // Shared and engine-test props.
  prop('apple', 'apple', { art: 'playground/apple.svg' }),
  prop('ball', 'ball', { art: 'playground/ball.svg' }),
  prop('cup', 'cup', {
    art: 'playground/cup.svg',
    artStates: when({ filled: true }, 'playground/cup-full.svg'),
    interactions: [{ type: 'useOn', target: 'sink', setSource: { filled: true } }],
  }),
  prop('lamp', 'lamp', {
    art: 'playground/lamp-off.svg',
    artStates: when({ on: true }, 'playground/lamp-on.svg'),
    layer: 'furniture',
    interactions: toggle('on'),
  }),
  prop('table', 'table', { art: 'playground/table.svg', layer: 'furniture' }),
  prop('shelf', 'shelf', { art: 'playground/shelf.svg', layer: 'furniture' }),
  prop('sink', 'sink', {
    art: 'playground/sink.svg',
    layer: 'furniture',
    // The countertop, under the faucet.
    useOnPoint: { x: 0, y: -138 },
  }),

  // Kitchen.
  prop('fridge', 'fridge', {
    art: 'home/fridge.svg',
    artStates: when({ open: true }, 'home/fridge-open.svg'),
    layer: 'furniture',
    interactions: toggle('open'),
  }),
  prop('stove', 'stove', {
    art: 'home/stove.svg',
    layer: 'furniture',
    useOnPoint: { x: 0, y: -210 },
  }),
  prop('pot', 'pot', {
    art: 'home/pot.svg',
    artStates: when({ boiling: true }, 'home/pot-boil-1.svg', [
      'home/pot-boil-1.svg',
      'home/pot-boil-2.svg',
    ]),
    interactions: [
      { type: 'useOn', target: 'stove', setSource: { boiling: true }, whileNear: true },
    ],
  }),
  prop('chair', 'chair', { art: 'home/chair.svg', layer: 'furniture' }),
  prop('plate', 'plate', { art: 'home/plate.svg' }),
  prop('bread', 'bread', { art: 'home/bread.svg' }),
  prop('milk', 'milk', { art: 'home/milk.svg' }),
  prop('cake', 'cake', { art: 'home/cake.svg' }),

  // Living room.
  prop('sofa', 'sofa', { art: 'home/sofa.svg', layer: 'furniture' }),
  prop('tv-cabinet', 'tvCabinet', { art: 'home/tv-cabinet.svg', layer: 'furniture' }),
  prop('tv', 'tv', {
    art: 'home/tv.svg',
    artStates: when({ on: true }, 'home/tv-on-1.svg', ['home/tv-on-1.svg', 'home/tv-on-2.svg']),
    layer: 'furniture',
    interactions: toggle('on'),
  }),
  prop('plant', 'plant', { art: 'home/plant.svg' }),
  prop('cat', 'cat', { art: 'home/cat.svg', interactions: [{ type: 'pet', sfx: 'purr' }] }),
  prop('aquarium', 'aquarium', { art: 'home/aquarium.svg', layer: 'furniture' }),
  prop('candles', 'candles', {
    art: 'home/candles-off.svg',
    artStates: when({ lit: true }, 'home/candles-on.svg'),
    interactions: toggle('lit'),
  }),

  // Kids' room.
  prop('bed', 'bed', { art: 'home/bed.svg', layer: 'furniture' }),
  prop('wardrobe', 'wardrobe', {
    art: 'home/wardrobe.svg',
    artStates: when({ open: true }, 'home/wardrobe-open.svg'),
    layer: 'furniture',
    interactions: toggle('open'),
  }),
  prop('book', 'book', { art: 'home/book.svg' }),
  prop('teddy', 'teddy', { art: 'home/teddy.svg' }),
  prop('train', 'train', { art: 'home/train.svg' }),
  prop('hippo', 'hippo', { art: 'home/hippo.svg' }),
];

export const propDefs: Readonly<Record<string, PropDef>> = Object.fromEntries(
  definitions.map((def) => [def.id, def]),
);

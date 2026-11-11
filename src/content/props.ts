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
  food?: boolean;
  changesOutfit?: PropDef['changesOutfit'];
  returnsAfterUse?: boolean;
  price?: number;
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
    ...(spec.food ? { food: true } : {}),
    ...(spec.changesOutfit ? { changesOutfit: spec.changesOutfit } : {}),
    ...(spec.returnsAfterUse ? { returnsAfterUse: true } : {}),
    ...(spec.price ? { price: spec.price } : {}),
  };
}

const toggle = (key: string): Interaction[] => [{ type: 'toggle', key }];
const when = (state: PropState, art: string, frames?: string[]) => [
  frames ? { when: state, art, frames } : { when: state, art },
];

const definitions: PropDef[] = [
  // Shared and engine-test props.
  prop('apple', 'apple', { art: 'playground/apple.svg', food: true, price: 1 }),
  prop('ball', 'ball', { art: 'playground/ball.svg' }),
  prop('cup', 'cup', {
    art: 'playground/cup.svg',
    artStates: when({ filled: true }, 'playground/cup-full.svg'),
    interactions: [
      { type: 'useOn', target: 'sink', setSource: { filled: true } },
      { type: 'useOn', target: 'water-cooler', setSource: { filled: true } },
    ],
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
  prop('bread', 'bread', { art: 'home/bread.svg', food: true, price: 3 }),
  prop('milk', 'milk', { art: 'home/milk.svg', food: true, price: 4 }),
  prop('cake', 'cake', { art: 'home/cake.svg', food: true }),

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
    changesOutfit: { key: 'open' },
  }),
  prop('book', 'book', { art: 'home/book.svg' }),
  prop('teddy', 'teddy', { art: 'home/teddy.svg' }),
  prop('train', 'train', { art: 'home/train.svg' }),
  prop('hippo', 'hippo', { art: 'home/hippo.svg' }),
  prop('piggy', 'piggy', {
    art: 'home/piggy.svg',
    interactions: [{ type: 'coins', amount: 10 }],
  }),

  // Makolet. Every product costs 1 to 10 shekels (SPEC §7.2).
  ...(
    [
      ['eggs', 5],
      ['cheese', 6],
      ['hummus', 5],
      ['pita', 2],
      ['banana', 2],
      ['tomato', 1],
      ['cucumber', 1],
      ['choco', 4],
      ['snack', 3],
      ['watermelon', 10],
      ['olives', 6],
      ['icecream', 7],
    ] as const
  ).map(([id, price]) => prop(id, id, { art: `makolet/${id}.svg`, food: true, price })),
  prop('shelf-unit', 'shelf', { art: 'makolet/shelf-unit.svg', layer: 'furniture' }),
  prop('freezer', 'freezer', { art: 'makolet/freezer.svg', layer: 'furniture' }),
  prop('counter', 'counter', { art: 'makolet/counter.svg', layer: 'furniture' }),
  prop('register', 'register', { art: 'makolet/register.svg', layer: 'furniture' }),
  prop('tray', 'tray', { art: 'makolet/tray.svg', layer: 'furniture' }),
  prop('bag', 'bag', {
    art: 'makolet/bag-empty.svg',
    artStates: when({ full: true }, 'makolet/bag-full.svg'),
    layer: 'furniture',
  }),

  // Gan: the classroom.
  prop('puppet-theater', 'puppetTheater', {
    art: 'gan/puppet-theater.svg',
    artStates: when({ open: true }, 'gan/puppet-theater-open.svg'),
    layer: 'furniture',
    interactions: toggle('open'),
  }),
  prop('peacock', 'peacock', { art: 'gan/peacock.svg' }),
  prop('elephant', 'elephant', { art: 'gan/elephant.svg' }),
  prop('monkey', 'monkey', { art: 'gan/monkey.svg' }),
  prop('easel', 'easel', {
    art: 'gan/easel.svg',
    artStates: when({ painted: true }, 'gan/easel-painted.svg'),
    layer: 'furniture',
    interactions: toggle('painted'),
  }),
  prop('blocks', 'blocks', {
    art: 'gan/blocks.svg',
    artStates: when({ built: true }, 'gan/blocks-tower.svg'),
    interactions: toggle('built'),
  }),
  prop('cubby', 'cubby', { art: 'gan/cubby.svg', layer: 'furniture' }),

  // Gan: the yard.
  prop('slide', 'slide', { art: 'gan/slide.svg', layer: 'furniture' }),
  prop('swing', 'swing', {
    art: 'gan/swing.svg',
    artStates: when({ swinging: true }, 'gan/swing-1.svg', ['gan/swing-1.svg', 'gan/swing-2.svg']),
    layer: 'furniture',
    interactions: toggle('swinging'),
  }),
  prop('sandbox', 'sandbox', {
    art: 'gan/sandbox.svg',
    layer: 'furniture',
    useOnPoint: { x: 0, y: -60 },
  }),
  prop('bucket', 'bucket', {
    art: 'gan/bucket.svg',
    artStates: when({ full: true }, 'gan/bucket-full.svg'),
    interactions: [
      { type: 'useOn', target: 'sandbox', setSource: { full: true } },
      // At the beach: turned over on the sand pile, it makes a castle.
      { type: 'useOn', target: 'sand-mound', setTarget: { built: true } },
    ],
    returnsAfterUse: true,
  }),
  prop('spade', 'spade', { art: 'gan/spade.svg' }),
  prop('tricycle', 'tricycle', { art: 'gan/tricycle.svg' }),

  // Clinic: the waiting room.
  prop('reception-desk', 'receptionDesk', { art: 'clinic/reception-desk.svg', layer: 'furniture' }),
  prop('bell', 'bell', { art: 'clinic/bell.svg', interactions: [{ type: 'pet', sfx: 'ding' }] }),
  prop('bench', 'bench', { art: 'clinic/bench.svg', layer: 'furniture' }),
  prop('water-cooler', 'waterCooler', {
    art: 'clinic/water-cooler.svg',
    layer: 'furniture',
    // The little tap.
    useOnPoint: { x: 0, y: -100 },
  }),
  prop('toy-box', 'toyBox', { art: 'clinic/toy-box.svg', layer: 'furniture' }),

  // Clinic: the doctor's room.
  prop('exam-bed', 'examBed', { art: 'clinic/exam-bed.svg', layer: 'furniture' }),
  prop('light-box', 'lightBox', {
    art: 'clinic/light-box.svg',
    artStates: when({ on: true }, 'clinic/light-box-on.svg'),
    layer: 'furniture',
    interactions: toggle('on'),
  }),
  prop('cabinet', 'cabinet', {
    art: 'clinic/cabinet.svg',
    artStates: when({ open: true }, 'clinic/cabinet-open.svg'),
    layer: 'furniture',
    interactions: toggle('open'),
  }),
  prop('computer', 'computer', {
    art: 'clinic/computer.svg',
    artStates: when({ on: true }, 'clinic/computer-on.svg'),
    interactions: toggle('on'),
  }),
  prop('doctor-scale', 'doctorScale', { art: 'clinic/doctor-scale.svg', layer: 'furniture' }),
  prop('stethoscope', 'stethoscope', { art: 'clinic/stethoscope.svg' }),
  prop('bandage', 'bandage', { art: 'clinic/bandage.svg' }),
  prop('thermometer', 'thermometer', { art: 'clinic/thermometer.svg' }),
  prop('doctor-bag', 'doctorBag', { art: 'clinic/doctor-bag.svg' }),
  prop('medicine', 'medicine', { art: 'clinic/medicine.svg' }),

  // Falafel stand: inside.
  prop('falafel-counter', 'counter', { art: 'falafel/counter.svg', layer: 'furniture' }),
  prop('fryer', 'fryer', {
    art: 'falafel/fryer.svg',
    artStates: when({ frying: true }, 'falafel/fryer-on-1.svg', [
      'falafel/fryer-on-1.svg',
      'falafel/fryer-on-2.svg',
    ]),
    layer: 'furniture',
    interactions: toggle('frying'),
  }),
  // Put falafel or salad on it and it fills up; eaten, it comes back empty.
  prop('falafel-pita', 'pita', {
    art: 'falafel/pita.svg',
    artStates: when({ stuffed: true }, 'falafel/pita-full.svg'),
    food: true,
    useOnPoint: { x: 0, y: -20 },
  }),
  prop('falafel-bowl', 'falafelBowl', {
    art: 'falafel/falafel-bowl.svg',
    interactions: [{ type: 'useOn', target: 'falafel-pita', setTarget: { stuffed: true } }],
    returnsAfterUse: true,
  }),
  prop('salad-bowl', 'salad', {
    art: 'falafel/salad-bowl.svg',
    interactions: [{ type: 'useOn', target: 'falafel-pita', setTarget: { stuffed: true } }],
    returnsAfterUse: true,
  }),
  prop('tahini', 'tahini', {
    art: 'falafel/tahini.svg',
    interactions: [{ type: 'useOn', target: 'falafel-pita', setTarget: { stuffed: true } }],
    returnsAfterUse: true,
  }),
  prop('drinks-fridge', 'drinksFridge', {
    art: 'falafel/drinks-fridge.svg',
    artStates: when({ open: true }, 'falafel/drinks-fridge-open.svg'),
    layer: 'furniture',
    interactions: toggle('open'),
  }),
  prop('lemonade', 'lemonade', { art: 'falafel/lemonade.svg', food: true }),
  prop('juice', 'juice', { art: 'falafel/juice.svg', food: true }),

  // Falafel stand: the terrace.
  prop('umbrella-table', 'umbrellaTable', { art: 'falafel/umbrella-table.svg', layer: 'furniture' }),
  prop('stool', 'stool', { art: 'falafel/stool.svg', layer: 'furniture' }),

  // Beach: the sand.
  prop('umbrella', 'umbrella', {
    art: 'beach/umbrella.svg',
    artStates: when({ open: true }, 'beach/umbrella-open.svg'),
    layer: 'furniture',
    interactions: toggle('open'),
  }),
  prop('beach-chair', 'beachChair', { art: 'beach/beach-chair.svg', layer: 'furniture' }),
  prop('towel', 'towel', { art: 'beach/towel.svg', layer: 'furniture' }),
  prop('sand-mound', 'sandcastle', {
    art: 'beach/sand-mound.svg',
    artStates: when({ built: true }, 'beach/sandcastle.svg'),
    layer: 'furniture',
    interactions: toggle('built'),
    useOnPoint: { x: 0, y: -30 },
  }),
  prop('cooler', 'cooler', {
    art: 'beach/cooler.svg',
    artStates: when({ open: true }, 'beach/cooler-open.svg'),
    layer: 'furniture',
    interactions: toggle('open'),
  }),
  prop('ice-pop', 'icePop', { art: 'beach/ice-pop.svg', food: true }),
  // Tapped, the sun puts on its sunglasses.
  prop('sun', 'sun', {
    art: 'beach/sun.svg',
    artStates: when({ glasses: true }, 'beach/sun-glasses.svg'),
    layer: 'furniture',
    interactions: toggle('glasses'),
  }),
  prop('matkot', 'matkot', { art: 'beach/matkot.svg' }),

  // Beach: the water's edge.
  prop('lifeguard-tower', 'lifeguardTower', { art: 'beach/lifeguard-tower.svg', layer: 'furniture' }),
  prop('turtle', 'turtle', { art: 'beach/turtle.svg' }),
  prop('shell', 'shell', { art: 'beach/shell.svg' }),
];

export const propDefs: Readonly<Record<string, PropDef>> = Object.fromEntries(
  definitions.map((def) => [def.id, def]),
);

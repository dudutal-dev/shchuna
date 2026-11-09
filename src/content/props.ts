import type { PropDef } from '../types';
import { strings } from './strings.he';

const names = strings.props;

export const propDefs: Readonly<Record<string, PropDef>> = {
  apple: {
    id: 'apple',
    nameHe: names.apple,
    voiceLine: 'prop.apple',
    art: 'playground/apple.svg',
    layer: 'item',
    draggable: true,
    interactions: [],
    letter: 'ת',
  },
  ball: {
    id: 'ball',
    nameHe: names.ball,
    voiceLine: 'prop.ball',
    art: 'playground/ball.svg',
    layer: 'item',
    draggable: true,
    interactions: [],
    letter: 'כ',
  },
  cup: {
    id: 'cup',
    nameHe: names.cup,
    voiceLine: 'prop.cup',
    art: 'playground/cup.svg',
    artStates: [{ when: { filled: true }, art: 'playground/cup-full.svg' }],
    layer: 'item',
    draggable: true,
    interactions: [{ type: 'useOn', target: 'sink', setSource: { filled: true } }],
  },
  lamp: {
    id: 'lamp',
    nameHe: names.lamp,
    voiceLine: 'prop.lamp',
    art: 'playground/lamp-off.svg',
    artStates: [{ when: { on: true }, art: 'playground/lamp-on.svg' }],
    layer: 'furniture',
    draggable: false,
    interactions: [{ type: 'toggle', key: 'on' }],
  },
  table: {
    id: 'table',
    nameHe: names.table,
    voiceLine: 'prop.table',
    art: 'playground/table.svg',
    layer: 'furniture',
    draggable: false,
    interactions: [],
  },
  shelf: {
    id: 'shelf',
    nameHe: names.shelf,
    voiceLine: 'prop.shelf',
    art: 'playground/shelf.svg',
    layer: 'furniture',
    draggable: false,
    interactions: [],
  },
  sink: {
    id: 'sink',
    nameHe: names.sink,
    voiceLine: 'prop.sink',
    art: 'playground/sink.svg',
    layer: 'furniture',
    draggable: false,
    interactions: [],
    // The countertop, under the faucet.
    useOnPoint: { x: 0, y: -138 },
  },
};

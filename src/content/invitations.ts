import type { Activity } from '../engine/DragSystem';
import type { LocationId } from '../types';

/** Where the demonstrating finger starts or ends. */
export type InviteTarget =
  /** Any character on screen who isn't already doing this. */
  | { person: true }
  /** The first of these props that is on screen. */
  | { prop: readonly string[] }
  | { surface: string };

/**
 * A gentle suggestion, said aloud while a see-through finger shows how: a tap on something,
 * or a drag from one thing to another. Offered only when the child has been still a while.
 */
export interface Invitation {
  id: string;
  /** The voice line. */
  line: string;
  show: { tap: InviteTarget } | { drag: InviteTarget; to: InviteTarget };
  /** Once this has happened, the invitation is not offered again. */
  doneWhen:
    | { activity: Activity['kind'] }
    | { state: { prop: string; key: string } }
    | { tap: string }
    | { surface: string };
  /** Offered only while this prop's state key is on (the bus doors open). */
  onlyWhen?: { prop: string; key: string };
}

const person = { person: true } as const;

export const INVITATIONS: Partial<Record<LocationId, readonly Invitation[]>> = {
  home: [
    { id: 'fridge', line: 'invite.fridge', show: { tap: { prop: ['fridge'] } }, doneWhen: { state: { prop: 'fridge', key: 'open' } } },
    { id: 'tv', line: 'invite.tv', show: { tap: { prop: ['tv'] } }, doneWhen: { state: { prop: 'tv', key: 'on' } } },
    { id: 'sofa', line: 'invite.sofa', show: { drag: person, to: { surface: 'sofa' } }, doneWhen: { activity: 'watch' } },
    {
      id: 'count',
      line: 'invite.count',
      show: { drag: { prop: ['bread', 'cake', 'apple', 'milk'] }, to: { surface: 'fruit-bowl' } },
      doneWhen: { surface: 'fruit-bowl' },
    },
    { id: 'cat', line: 'invite.cat', show: { tap: { prop: ['cat'] } }, doneWhen: { tap: 'cat' } },
    { id: 'eat', line: 'invite.eat', show: { drag: person, to: { surface: 'chair' } }, doneWhen: { activity: 'eat' } },
    { id: 'sleep', line: 'invite.sleep', show: { drag: person, to: { surface: 'bed' } }, doneWhen: { activity: 'sleep' } },
  ],
  makolet: [
    {
      id: 'shop',
      line: 'invite.shop',
      show: { drag: { prop: ['mk-bread', 'mk-milk', 'mk-banana', 'mk-tomato', 'mk-pita', 'mk-choco'] }, to: { surface: 'belt' } },
      doneWhen: { surface: 'belt' },
    },
  ],
  gan: [
    { id: 'slide', line: 'invite.slide', show: { drag: person, to: { surface: 'slide-top' } }, doneWhen: { activity: 'slide' } },
    { id: 'swing', line: 'invite.swing', show: { drag: person, to: { surface: 'swing-seat' } }, doneWhen: { activity: 'swing' } },
    {
      id: 'theater',
      line: 'invite.theater',
      show: { tap: { prop: ['gan-puppet-theater'] } },
      doneWhen: { state: { prop: 'gan-puppet-theater', key: 'open' } },
    },
    { id: 'easel', line: 'invite.easel', show: { tap: { prop: ['gan-easel'] } }, doneWhen: { state: { prop: 'gan-easel', key: 'painted' } } },
  ],
  clinic: [
    {
      id: 'xray',
      line: 'invite.xray',
      show: { tap: { prop: ['clinic-light-box'] } },
      doneWhen: { state: { prop: 'clinic-light-box', key: 'on' } },
    },
    { id: 'exam', line: 'invite.exam', show: { drag: person, to: { surface: 'exam-bed' } }, doneWhen: { surface: 'exam-bed' } },
  ],
  falafel: [
    {
      id: 'pita',
      line: 'invite.pita',
      show: { drag: { prop: ['falafel-falafel-bowl'] }, to: { prop: ['falafel-falafel-pita'] } },
      doneWhen: { state: { prop: 'falafel-falafel-pita', key: 'stuffed' } },
    },
  ],
  beach: [
    { id: 'swim', line: 'invite.swim', show: { drag: person, to: { surface: 'sea' } }, doneWhen: { activity: 'swim' } },
    {
      id: 'castle',
      line: 'invite.castle',
      show: { drag: { prop: ['beach-bucket'] }, to: { prop: ['beach-sand-mound'] } },
      doneWhen: { state: { prop: 'beach-sand-mound', key: 'built' } },
    },
  ],
  station: [
    { id: 'bus', line: 'invite.bus', show: { tap: { prop: ['station-bus'] } }, doneWhen: { state: { prop: 'station-bus', key: 'open' } } },
    {
      id: 'ride',
      line: 'invite.ride',
      show: { drag: person, to: { surface: 'bus-seats' } },
      doneWhen: { surface: 'bus-seats' },
      onlyWhen: { prop: 'station-bus', key: 'open' },
    },
  ],
};

/** Each invitation at most this often in one visit to a place. */
export const INVITE_MAX_TIMES = 2;
/** Spoken invitations at least this far apart; in between, the quiet twinkle hint. */
export const INVITE_GAP_MS = 30_000;

export interface InviteContext {
  done(invitation: Invitation): boolean;
  timesShown(id: string): number;
  isOn(prop: string, key: string): boolean;
  /** Where the finger would start and end on screen, or null if that isn't on screen now. */
  points(invitation: Invitation): { from: { x: number; y: number }; to?: { x: number; y: number } } | null;
}

/**
 * The invitation to offer now, if any: not done yet, not offered too often, its condition
 * met, and everything it points at on screen. Earlier in the list comes first.
 */
export function pickInvitation(
  list: readonly Invitation[],
  context: InviteContext,
): { invitation: Invitation; from: { x: number; y: number }; to?: { x: number; y: number } } | null {
  for (const invitation of list) {
    if (context.done(invitation)) continue;
    if (context.timesShown(invitation.id) >= INVITE_MAX_TIMES) continue;
    if (invitation.onlyWhen && !context.isOn(invitation.onlyWhen.prop, invitation.onlyWhen.key)) continue;
    const points = context.points(invitation);
    if (points) return { invitation, ...points };
  }
  return null;
}

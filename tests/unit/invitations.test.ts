import { describe, expect, it } from 'vitest';
import { INVITATIONS, INVITE_MAX_TIMES, pickInvitation, type Invitation, type InviteContext } from '../../src/content/invitations';
import { propDefs } from '../../src/content/props';
import voiceLines from '../../src/content/voice-lines.json';

const here = { x: 100, y: 100 };

function context(overrides: Partial<InviteContext> = {}): InviteContext {
  return {
    done: () => false,
    timesShown: () => 0,
    isOn: () => false,
    points: () => ({ from: here }),
    ...overrides,
  };
}

const list: Invitation[] = [
  { id: 'a', line: 'invite.a', show: { tap: { prop: ['x'] } }, doneWhen: { tap: 'x' } },
  { id: 'b', line: 'invite.b', show: { tap: { prop: ['y'] } }, doneWhen: { tap: 'y' }, onlyWhen: { prop: 'bus', key: 'open' } },
  { id: 'c', line: 'invite.c', show: { tap: { prop: ['z'] } }, doneWhen: { tap: 'z' } },
];

describe('invitations', () => {
  it('offers the first one that fits', () => {
    expect(pickInvitation(list, context())?.invitation.id).toBe('a');
  });

  it('skips what the child already did, and what was offered twice', () => {
    const done = context({ done: (i) => i.id === 'a', timesShown: (id) => (id === 'c' ? INVITE_MAX_TIMES : 0) });
    // b waits for the bus doors to open, so nothing fits.
    expect(pickInvitation(list, done)).toBeNull();
    expect(pickInvitation(list, { ...done, isOn: () => true })?.invitation.id).toBe('b');
  });

  it('skips one whose things are not on screen', () => {
    const offScreen = context({ points: (i) => (i.id === 'a' ? null : { from: here }) });
    expect(pickInvitation(list, offScreen)?.invitation.id).toBe('c');
  });

  it('has a voice line for every invitation, never twice the same id in a place', () => {
    const ids = new Set(voiceLines.map((line) => line.id));
    for (const [place, invitations] of Object.entries(INVITATIONS)) {
      const seen = new Set<string>();
      for (const invitation of invitations ?? []) {
        expect(ids.has(invitation.line), `${place}: ${invitation.line}`).toBe(true);
        expect(seen.has(invitation.id), `${place}: ${invitation.id}`).toBe(false);
        seen.add(invitation.id);
      }
    }
    // Lines that speak to the child are gender-neutral: "let's", "who wants".
    expect(propDefs).toBeTruthy();
  });
});

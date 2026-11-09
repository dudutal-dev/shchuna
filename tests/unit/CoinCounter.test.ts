import { describe, expect, it } from 'vitest';
import {
  COINS,
  CoinCounter,
  makeChange,
  MAX_TOTAL,
  shekelsLine,
  spend,
  WALLET_REFILL,
  type Coin,
} from '../../src/learning/CoinCounter';
import voiceLines from '../../src/content/voice-lines.json';

const sum = (coins: readonly number[]) => coins.reduce((a, b) => a + b, 0);

/** Every order of coins a child could pay with, stopping once the price is reached. */
function payments(price: number): Coin[][] {
  const result: Coin[][] = [];
  const walk = (sequence: Coin[], total: number) => {
    if (total >= price) {
      result.push(sequence);
      return;
    }
    for (const coin of COINS) walk([...sequence, coin], total + coin);
  };
  walk([], 0);
  return result;
}

describe('makeChange', () => {
  it.each([
    [0, []],
    [1, [1]],
    [3, [2, 1]],
    [4, [2, 2]],
    [7, [5, 2]],
    [9, [5, 2, 2]],
  ])('gives %i as the fewest coins', (amount, coins) => {
    expect(makeChange(amount)).toEqual(coins);
  });

  it('always adds up to the amount', () => {
    for (let amount = 0; amount <= 30; amount++) expect(sum(makeChange(amount))).toBe(amount);
  });
});

describe('CoinCounter', () => {
  it('counts up, then finishes with no change on an exact payment', () => {
    const counter = new CoinCounter(3);
    expect(counter.pay(1)).toEqual({ kind: 'counting', paid: 1 });
    expect(counter.pay(2)).toEqual({ kind: 'done', paid: 3, change: [] });
  });

  it('gives change for an overpayment: 5 for a price of 3 returns 2', () => {
    expect(new CoinCounter(3).pay(5)).toEqual({ kind: 'done', paid: 5, change: [2] });
  });

  it('refuses coins once paid', () => {
    const counter = new CoinCounter(1);
    counter.pay(1);
    expect(counter.pay(10)).toBeNull();
    expect(counter.paid).toBe(1);
  });

  it('rejects a price that is not a whole positive number', () => {
    expect(() => new CoinCounter(0)).toThrow();
    expect(() => new CoinCounter(2.5)).toThrow();
  });

  // SPEC §16.1: every coin combination for every price from 1 to 10.
  it('is right for every way to pay every price from 1 to 10', () => {
    let checked = 0;
    for (let price = 1; price <= 10; price++) {
      for (const sequence of payments(price)) {
        const counter = new CoinCounter(price);
        const results = sequence.map((coin) => counter.pay(coin));
        const last = results.at(-1);
        expect(last?.kind).toBe('done');
        if (last?.kind !== 'done') continue;
        expect(last.paid).toBe(sum(sequence));
        expect(sum(last.change)).toBe(last.paid - price);
        // Paying stops at the coin that crossed the price, so change is less than that coin.
        expect(sum(last.change)).toBeLessThan(sequence.at(-1)!);
        // Every earlier coin was still counting, with the right running total.
        results.slice(0, -1).forEach((result, index) => {
          expect(result).toEqual({ kind: 'counting', paid: sum(sequence.slice(0, index + 1)) });
        });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('spend', () => {
  it('takes the coin from the purse', () => {
    expect(spend(12, 5)).toEqual({ wallet: 7, refilled: false });
  });

  it('refills an empty or short purse instead of refusing', () => {
    expect(spend(0, 10)).toEqual({ wallet: WALLET_REFILL - 10, refilled: true });
    expect(spend(3, 5)).toEqual({ wallet: WALLET_REFILL - 5, refilled: true });
  });
});

describe('counting lines', () => {
  it('has a recorded line for every amount the shop can say', () => {
    const ids = new Set(voiceLines.map((line) => line.id));
    for (let amount = 1; amount <= MAX_TOTAL; amount++) {
      expect(ids.has(shekelsLine(amount)), shekelsLine(amount)).toBe(true);
    }
  });
});

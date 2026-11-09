/** The coins a child pays with, in shekels. Play money: never real. */
export const COINS = [1, 2, 5, 10] as const;
export type Coin = (typeof COINS)[number];

/** A purse that runs dry fills back up to this, so play never stops. */
export const WALLET_REFILL = 20;
/** The most the belt can add up to, so every total has a recorded number. */
export const MAX_TOTAL = 20;

/** Fewest coins making `amount`, largest first. */
export function makeChange(amount: number): Coin[] {
  const coins: Coin[] = [];
  let left = Math.max(0, Math.round(amount));
  for (const coin of [...COINS].reverse()) {
    while (left >= coin) {
      coins.push(coin);
      left -= coin;
    }
  }
  return coins;
}

export type PayResult =
  /** Still short: `paid` is the running total to count aloud. */
  | { kind: 'counting'; paid: number }
  /** Paid in full. `change` is what comes back, which may be nothing. */
  | { kind: 'done'; paid: number; change: Coin[] };

/** Counts coins towards a price. Once paid, further coins are refused. */
export class CoinCounter {
  private paidSoFar: number;

  /** `alreadyPaid` carries coins over when another item joins the belt mid-payment. */
  constructor(
    readonly price: number,
    alreadyPaid = 0,
  ) {
    if (!Number.isInteger(price) || price < 1) throw new Error(`Bad price: ${price}`);
    this.paidSoFar = alreadyPaid;
  }

  get paid(): number {
    return this.paidSoFar;
  }

  get done(): boolean {
    return this.paidSoFar >= this.price;
  }

  /** Adds a coin, or returns null if the price was already paid. */
  pay(coin: Coin): PayResult | null {
    if (this.done) return null;
    this.paidSoFar += coin;
    if (!this.done) return { kind: 'counting', paid: this.paidSoFar };
    return { kind: 'done', paid: this.paidSoFar, change: makeChange(this.paidSoFar - this.price) };
  }
}

/** Takes a coin out of the purse, topping it up first if it can't cover the coin. */
export function spend(wallet: number, coin: Coin): { wallet: number; refilled: boolean } {
  const refilled = wallet < coin;
  const start = refilled ? Math.max(wallet, WALLET_REFILL) : wallet;
  return { wallet: start - coin, refilled };
}

/** Voice line id for "N shekels", 1 to MAX_TOTAL. */
export function shekelsLine(amount: number): string {
  return `count.shekels.${amount}`;
}

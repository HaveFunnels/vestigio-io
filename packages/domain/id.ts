// ──────────────────────────────────────────────
// Scoped ID Generator — deterministic, no global state
// ──────────────────────────────────────────────

export class IdGenerator {
  private counter = 0;

  constructor(private prefix: string) {}

  next(): string {
    return `${this.prefix}_${++this.counter}`;
  }

  reset(): void {
    this.counter = 0;
  }

  current(): number {
    return this.counter;
  }
}

export function createIdGenerator(prefix: string): IdGenerator {
  return new IdGenerator(prefix);
}

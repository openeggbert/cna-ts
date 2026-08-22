const TICKS_PER_MILLISECOND = 10_000n;
const TICKS_PER_SECOND = 10_000_000n;
const TICKS_PER_MINUTE = 600_000_000n;
const TICKS_PER_HOUR = 36_000_000_000n;
const TICKS_PER_DAY = 864_000_000_000n;
const MIN_TICKS = -9_223_372_036_854_775_808n;
const MAX_TICKS = 9_223_372_036_854_775_807n;

function checkedTicks(value: bigint): bigint {
  if (value < MIN_TICKS || value > MAX_TICKS) {
    throw new RangeError("TimeSpan ticks exceed the signed 64-bit CLR range");
  }
  return value;
}

function fromNumber(value: number, ticksPerUnit: number): TimeSpan {
  if (!Number.isFinite(value)) {
    throw new RangeError("TimeSpan values must be finite");
  }
  return new TimeSpan(checkedTicks(BigInt(Math.trunc(value * ticksPerUnit))));
}

/** A tick-precise projection of System.TimeSpan for XNA timing APIs. */
export class TimeSpan {
  public static get Zero(): TimeSpan {
    return new TimeSpan();
  }

  public static get MinValue(): TimeSpan {
    return new TimeSpan(MIN_TICKS);
  }

  public static get MaxValue(): TimeSpan {
    return new TimeSpan(MAX_TICKS);
  }

  public constructor(public readonly Ticks: bigint = 0n) {
    checkedTicks(Ticks);
  }

  public static FromTicks(value: bigint): TimeSpan {
    return new TimeSpan(value);
  }

  public static FromMilliseconds(value: number): TimeSpan {
    return fromNumber(value, Number(TICKS_PER_MILLISECOND));
  }

  public static FromSeconds(value: number): TimeSpan {
    return fromNumber(value, Number(TICKS_PER_SECOND));
  }

  public static FromMinutes(value: number): TimeSpan {
    return fromNumber(value, Number(TICKS_PER_MINUTE));
  }

  public static FromHours(value: number): TimeSpan {
    return fromNumber(value, Number(TICKS_PER_HOUR));
  }

  public static FromDays(value: number): TimeSpan {
    return fromNumber(value, Number(TICKS_PER_DAY));
  }

  public get Days(): number {
    return Number(this.Ticks / TICKS_PER_DAY);
  }

  public get Hours(): number {
    return Number((this.Ticks % TICKS_PER_DAY) / TICKS_PER_HOUR);
  }

  public get Minutes(): number {
    return Number((this.Ticks % TICKS_PER_HOUR) / TICKS_PER_MINUTE);
  }

  public get Seconds(): number {
    return Number((this.Ticks % TICKS_PER_MINUTE) / TICKS_PER_SECOND);
  }

  public get Milliseconds(): number {
    return Number((this.Ticks % TICKS_PER_SECOND) / TICKS_PER_MILLISECOND);
  }

  public get TotalDays(): number {
    return Number(this.Ticks) / Number(TICKS_PER_DAY);
  }

  public get TotalHours(): number {
    return Number(this.Ticks) / Number(TICKS_PER_HOUR);
  }

  public get TotalMinutes(): number {
    return Number(this.Ticks) / Number(TICKS_PER_MINUTE);
  }

  public get TotalSeconds(): number {
    return Number(this.Ticks) / Number(TICKS_PER_SECOND);
  }

  public get TotalMilliseconds(): number {
    return Number(this.Ticks) / Number(TICKS_PER_MILLISECOND);
  }

  public Add(value: TimeSpan): TimeSpan {
    return new TimeSpan(checkedTicks(this.Ticks + value.Ticks));
  }

  public Subtract(value: TimeSpan): TimeSpan {
    return new TimeSpan(checkedTicks(this.Ticks - value.Ticks));
  }

  public Negate(): TimeSpan {
    if (this.Ticks === MIN_TICKS) {
      throw new RangeError("TimeSpan.MinValue cannot be negated");
    }
    return new TimeSpan(-this.Ticks);
  }

  public Duration(): TimeSpan {
    return this.Ticks < 0n ? this.Negate() : this;
  }

  public Equals(value: TimeSpan): boolean {
    return this.Ticks === value.Ticks;
  }

  public static Compare(left: TimeSpan, right: TimeSpan): number {
    return left.Ticks < right.Ticks ? -1 : left.Ticks > right.Ticks ? 1 : 0;
  }
}

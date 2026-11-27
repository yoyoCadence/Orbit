// TEST-015 (see futureClock.config.js): every `new Date()` and `Date.now()`
// starts from FUTURE_NOW and moves on from there; fake timers still work on top.
// Not shifted (none is used in pwa/js or tests today): `Date()` called without
// `new` throws (a class), `Intl.DateTimeFormat().format()` with no date,
// `performance.timeOrigin`, `vi.getRealSystemTime()`; `structuredClone(date)`
// gives a plain Date that fails `instanceof Date`.
const target = Date.parse(process.env.FUTURE_NOW ?? '');
if (Number.isNaN(target)) {
  throw new Error('Set FUTURE_NOW, e.g. FUTURE_NOW=2027-06-01T03:00:00Z');
}

const RealDate = Date;
const offset = target - RealDate.now();

class FutureDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(RealDate.now() + offset);
  }

  static now() {
    return RealDate.now() + offset;
  }
}

globalThis.Date = FutureDate;

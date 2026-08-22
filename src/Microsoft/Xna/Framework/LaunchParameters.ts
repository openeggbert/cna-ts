/** String launch arguments projected onto JavaScript's native Map contract. */
export class LaunchParameters extends Map<string, string> {
  public constructor() {
    super();
    const processValue = (globalThis as { process?: { argv?: unknown } }).process;
    const argv = Array.isArray(processValue?.argv)
      ? processValue.argv.filter((value): value is string => typeof value === "string").slice(2)
      : [];
    for (const raw of argv) {
      const argument = raw.replace(/^[/\-]+/, "");
      const separator = argument.indexOf(":");
      const key = separator < 0 ? argument : argument.slice(0, separator);
      const value = separator < 0 ? "" : argument.slice(separator + 1);
      if (key !== "" && !this.has(key)) this.set(key, value);
    }
  }
}

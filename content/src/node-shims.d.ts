/**
 * The minimum Node surface this package uses, declared here rather than pulled in as a dependency.
 *
 * `@types/node` is a large moving target and this package touches four functions. `cna-ts` takes
 * the same approach for the same reason: what is declared is what is used, so an unintended
 * dependency on a Node API is a compile error rather than something that silently works.
 */

declare module "node:module" {
  export function createRequire(url: string): (specifier: string) => unknown;
}

declare module "node:path" {
  export function resolve(...parts: string[]): string;
}

interface ImportMeta {
  readonly url: string;
}

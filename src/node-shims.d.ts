declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function existsSync(path: string): boolean;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function readdirSync(path: string, options: { withFileTypes: true }): Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function statfsSync(path: string, options: { bigint: true }): { bavail: bigint; blocks: bigint; bsize: bigint };
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function isAbsolute(path: string): boolean;
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export const sep: string;
}

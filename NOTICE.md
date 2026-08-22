# Notices

CNA-TS (`cna-ts`) is licensed under the Microsoft Public License (Ms-PL).

CNA-TS is the canonical TypeScript and JavaScript binding for
[CNA](https://github.com/openeggbert/cna). The npm package contains generated JavaScript and
TypeScript declarations but does not contain Microsoft XNA Framework binaries.

## Microsoft XNA Framework naming

The project preserves XNA names as part of an XNA 4.0 TypeScript/JavaScript API projection. It is
not produced, endorsed, or supported by Microsoft. Compatibility authority comes from lawfully
obtained XNA 4.0 reference assembly metadata and measured behavior, not from CNA-TS declarations.

## CNA, Sharp Runtime, and FNA

CNA may use Sharp Runtime internally as a C++ implementation dependency. No Sharp Runtime API or
ABI is exposed by this package. Portions of CNA are derived from or based on FNA, licensed under
the Ms-PL, copyright 2009-2024 Ethan Lee and the MonoGame Team. CNA-TS does not include FNA source
code.

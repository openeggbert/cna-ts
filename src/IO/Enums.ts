export enum FileMode {
  CreateNew = 1,
  Create = 2,
  Open = 3,
  OpenOrCreate = 4,
  Truncate = 5,
  Append = 6,
}

export enum FileAccess {
  Read = 1,
  Write = 2,
  ReadWrite = 3,
}

export enum FileShare {
  None = 0,
  Read = 1,
  Write = 2,
  ReadWrite = 3,
  Delete = 4,
  Inheritable = 16,
}

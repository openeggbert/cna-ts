import { Attribute } from "../../../../Attribute.js";
import { ArgumentNullException } from "../../../../internal/exceptions.js";

export class ContentSerializerAttribute extends Attribute {
  #allowNull = false;
  #collectionItemName = "";
  #elementName = "";
  #flattenContent = false;
  #optional = false;
  #sharedResource = false;

  public constructor() { super(); }
  public get AllowNull(): boolean { return this.#allowNull; }
  public set AllowNull(value: boolean) { this.#allowNull = Boolean(value); }
  public get CollectionItemName(): string { return this.#collectionItemName; }
  public set CollectionItemName(value: string) { this.#collectionItemName = value ?? ""; }
  public get ElementName(): string { return this.#elementName; }
  public set ElementName(value: string) { this.#elementName = value ?? ""; }
  public get FlattenContent(): boolean { return this.#flattenContent; }
  public set FlattenContent(value: boolean) { this.#flattenContent = Boolean(value); }
  public get Optional(): boolean { return this.#optional; }
  public set Optional(value: boolean) { this.#optional = Boolean(value); }
  public get SharedResource(): boolean { return this.#sharedResource; }
  public set SharedResource(value: boolean) { this.#sharedResource = Boolean(value); }
  public get HasCollectionItemName(): boolean { return this.CollectionItemName.length > 0; }
  public Clone(): ContentSerializerAttribute {
    const result = new ContentSerializerAttribute();
    result.AllowNull = this.AllowNull;
    result.CollectionItemName = this.CollectionItemName;
    result.ElementName = this.ElementName;
    result.FlattenContent = this.FlattenContent;
    result.Optional = this.Optional;
    result.SharedResource = this.SharedResource;
    return result;
  }
}

export class ContentSerializerCollectionItemNameAttribute extends Attribute {
  readonly #collectionItemName: string;
  public constructor(collectionItemName: string) {
    super();
    if (collectionItemName == null) throw new ArgumentNullException("collectionItemName");
    this.#collectionItemName = collectionItemName;
  }
  public get CollectionItemName(): string { return this.#collectionItemName; }
}

export class ContentSerializerIgnoreAttribute extends Attribute {
  public constructor() { super(); }
}

export class ContentSerializerRuntimeTypeAttribute extends Attribute {
  readonly #runtimeType: string;
  public constructor(runtimeType: string) {
    super();
    if (runtimeType == null) throw new ArgumentNullException("runtimeType");
    this.#runtimeType = runtimeType;
  }
  public get RuntimeType(): string { return this.#runtimeType; }
}

export class ContentSerializerTypeVersionAttribute extends Attribute {
  readonly #typeVersion: number;
  public constructor(typeVersion: number) {
    super();
    this.#typeVersion = Math.trunc(typeVersion);
  }
  public get TypeVersion(): number { return this.#typeVersion; }
}

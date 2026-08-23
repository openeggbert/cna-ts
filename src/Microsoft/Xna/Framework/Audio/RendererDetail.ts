const values = new WeakMap<RendererDetail, { FriendlyName: string | null; RendererId: string | null }>();

function stringHash(value: string | null): number {
  if (value == null) return 0;
  let first = 5381 | 0;
  let second = first;
  for (let index = 0; index < value.length; index += 2) {
    first = (((first << 5) + first) ^ value.charCodeAt(index)) | 0;
    if (index === value.length - 1) break;
    second = (((second << 5) + second) ^ value.charCodeAt(index + 1)) | 0;
  }
  return (first + Math.imul(second, 1_566_083_941)) | 0;
}

export class RendererDetail {
  public get FriendlyName(): string { return values.get(this)?.FriendlyName as string; }
  public get RendererId(): string { return values.get(this)?.RendererId as string; }

  public Equals(obj: unknown): boolean {
    return obj instanceof RendererDetail &&
      this.FriendlyName === obj.FriendlyName && this.RendererId === obj.RendererId;
  }

  public GetHashCode(): number {
    return stringHash(this.FriendlyName ?? null) ^ stringHash(this.RendererId ?? null);
  }

  public ToString(): string { return "Microsoft.Xna.Framework.Audio.RendererDetail"; }
}

export function createRendererDetailForInternalUse(
  friendlyName: string | null,
  rendererId: string | null,
): RendererDetail {
  const result = new RendererDetail();
  values.set(result, { FriendlyName: friendlyName, RendererId: rendererId });
  return result;
}

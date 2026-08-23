import { InvalidOperationException } from "../../../../internal/exceptions.js";
import { EventArgs } from "../EventArgs.js";

const createdResources = new WeakMap<ResourceCreatedEventArgs, unknown>();
const destroyedResources = new WeakMap<ResourceDestroyedEventArgs, { Name: string; Tag: unknown }>();

export class ResourceCreatedEventArgs extends EventArgs {
  private constructor() { super(); }
  public get Resource(): unknown {
    if (!createdResources.has(this)) throw new InvalidOperationException("Invalid resource event arguments");
    return createdResources.get(this);
  }
}

export class ResourceDestroyedEventArgs extends EventArgs {
  private constructor() { super(); }
  public get Name(): string {
    const value = destroyedResources.get(this);
    if (!value) throw new InvalidOperationException("Invalid resource event arguments");
    return value.Name;
  }
  public get Tag(): unknown {
    const value = destroyedResources.get(this);
    if (!value) throw new InvalidOperationException("Invalid resource event arguments");
    return value.Tag;
  }
}

export function createResourceCreatedEventArgsForInternalUse(resource: unknown): ResourceCreatedEventArgs {
  const args = Object.create(ResourceCreatedEventArgs.prototype) as ResourceCreatedEventArgs;
  createdResources.set(args, resource);
  return args;
}

export function createResourceDestroyedEventArgsForInternalUse(
  name: string,
  tag: unknown,
): ResourceDestroyedEventArgs {
  const args = Object.create(ResourceDestroyedEventArgs.prototype) as ResourceDestroyedEventArgs;
  destroyedResources.set(args, { Name: name, Tag: tag });
  return args;
}

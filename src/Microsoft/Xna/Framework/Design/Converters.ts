import type { Attribute } from "../../../../Attribute.js";
import {
  Collections,
  ComponentModel,
  Globalization,
} from "../../../../internal/system-compat.js";
import { BoundingBox } from "../BoundingBox.js";
import { BoundingSphere } from "../BoundingSphere.js";
import { Color } from "../Color.js";
import type { XnaType } from "../Contracts.js";
import { Matrix } from "../Matrix.js";
import { Plane } from "../Plane.js";
import { Point } from "../Point.js";
import { Quaternion } from "../Quaternion.js";
import { Ray } from "../Ray.js";
import { Rectangle } from "../Rectangle.js";
import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import { Vector4 } from "../Vector4.js";

type Dictionary = Collections.IDictionary;

function separator(culture: Globalization.CultureInfo): string { return culture?.ListSeparator ?? ","; }

function numbers(value: unknown, culture: Globalization.CultureInfo, expected: number): number[] {
  if (typeof value !== "string") throw new TypeError("value must be a string");
  const decimal = culture?.DecimalSeparator ?? ".";
  const values = value.trim().split(separator(culture)).map((part) => {
    const normalized = decimal === "." ? part.trim() : part.trim().replace(decimal, ".");
    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) throw new TypeError(`'${part.trim()}' is not a number`);
    return parsed;
  });
  if (values.length !== expected) throw new RangeError(`Expected ${expected} values`);
  return values;
}

function dictionaryValue(values: Dictionary, name: string): unknown {
  if ("get" in values && typeof values.get === "function") return values.get(name);
  return (values as Readonly<Record<string, unknown>>)[name];
}

function num(values: Dictionary, name: string): number {
  const value = Number(dictionaryValue(values, name));
  if (Number.isNaN(value)) throw new TypeError(`${name} must be numeric`);
  return value;
}

function objectValue<T>(values: Dictionary, name: string, type: new (...args: never[]) => T): T {
  const value = dictionaryValue(values, name);
  if (!(value instanceof type)) throw new TypeError(`${name} has the wrong value type`);
  return value;
}

function formatNumber(value: number, culture: Globalization.CultureInfo): string {
  const result = String(value);
  const decimal = culture?.DecimalSeparator ?? ".";
  return decimal === "." ? result : result.replace(".", decimal);
}

function flatValues(value: unknown): number[] {
  if (value instanceof Point) return [value.X, value.Y];
  if (value instanceof Rectangle) return [value.X, value.Y, value.Width, value.Height];
  if (value instanceof Vector2) return [value.X, value.Y];
  if (value instanceof Vector3) return [value.X, value.Y, value.Z];
  if (value instanceof Vector4 || value instanceof Quaternion) return [value.X, value.Y, value.Z, value.W];
  if (value instanceof Color) return [value.R, value.G, value.B, value.A];
  if (value instanceof Matrix) return [
    value.M11, value.M12, value.M13, value.M14,
    value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34,
    value.M41, value.M42, value.M43, value.M44,
  ];
  if (value instanceof Plane) return [value.Normal.X, value.Normal.Y, value.Normal.Z, value.D];
  if (value instanceof BoundingBox) return [value.Min.X, value.Min.Y, value.Min.Z, value.Max.X, value.Max.Y, value.Max.Z];
  if (value instanceof BoundingSphere) return [value.Center.X, value.Center.Y, value.Center.Z, value.Radius];
  if (value instanceof Ray) return [value.Position.X, value.Position.Y, value.Position.Z, value.Direction.X, value.Direction.Y, value.Direction.Z];
  throw new TypeError("value has the wrong math type");
}

function convertToString(value: unknown, culture: Globalization.CultureInfo, destinationType: XnaType<unknown>): unknown {
  if (destinationType !== String) throw new TypeError("Only string conversion is available in TypeScript");
  return flatValues(value).map((item) => formatNumber(item, culture)).join(`${separator(culture)} `);
}

export class MathTypeConverter extends ComponentModel.ExpandableObjectConverter {
  protected propertyDescriptions: ComponentModel.PropertyDescriptorCollection;
  protected supportStringConvert: boolean;

  public constructor() {
    super();
    this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection();
    this.supportStringConvert = true;
  }

  public override CanConvertFrom(
    context: ComponentModel.ITypeDescriptorContext,
    sourceType: XnaType<unknown>,
  ): boolean { return this.supportStringConvert && sourceType === String; }

  public override CanConvertTo(
    context: ComponentModel.ITypeDescriptorContext,
    destinationType: XnaType<unknown>,
  ): boolean { return destinationType === String; }

  public override GetCreateInstanceSupported(context: ComponentModel.ITypeDescriptorContext): boolean { return true; }
  public override GetProperties(
    context: ComponentModel.ITypeDescriptorContext,
    value: unknown,
    attributes: Attribute[],
  ): ComponentModel.PropertyDescriptorCollection { return this.propertyDescriptions; }
  public override GetPropertiesSupported(context: ComponentModel.ITypeDescriptorContext): boolean { return true; }
}

export class PointConverter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["X", "Y"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown {
    const [x, y] = numbers(value, culture, 2); return new Point(x, y);
  }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown {
    return convertToString(value, culture, destinationType);
  }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown {
    return new Point(num(propertyValues, "X"), num(propertyValues, "Y"));
  }
}

export class RectangleConverter extends MathTypeConverter {
  public constructor() { super(); this.supportStringConvert = false; this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["X", "Y", "Width", "Height"]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown {
    return convertToString(value, culture, destinationType);
  }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown {
    return new Rectangle(num(propertyValues, "X"), num(propertyValues, "Y"), num(propertyValues, "Width"), num(propertyValues, "Height"));
  }
}

export class Vector2Converter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["X", "Y"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 2); return new Vector2(v[0], v[1]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new Vector2(num(propertyValues, "X"), num(propertyValues, "Y")); }
}

export class Vector3Converter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["X", "Y", "Z"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 3); return new Vector3(v[0], v[1], v[2]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new Vector3(num(propertyValues, "X"), num(propertyValues, "Y"), num(propertyValues, "Z")); }
}

export class Vector4Converter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["X", "Y", "Z", "W"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 4); return new Vector4(v[0], v[1], v[2], v[3]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new Vector4(num(propertyValues, "X"), num(propertyValues, "Y"), num(propertyValues, "Z"), num(propertyValues, "W")); }
}

export class QuaternionConverter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["X", "Y", "Z", "W"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 4); return new Quaternion(v[0], v[1], v[2], v[3]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new Quaternion(num(propertyValues, "X"), num(propertyValues, "Y"), num(propertyValues, "Z"), num(propertyValues, "W")); }
}

export class MatrixConverter extends MathTypeConverter {
  static readonly #names = ["M11", "M12", "M13", "M14", "M21", "M22", "M23", "M24", "M31", "M32", "M33", "M34", "M41", "M42", "M43", "M44"];
  public constructor() { super(); this.supportStringConvert = false; this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(MatrixConverter.#names); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown {
    const v = MatrixConverter.#names.map((name) => num(propertyValues, name)); return new Matrix(...v as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]);
  }
}

export class BoundingBoxConverter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["Min", "Max"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 6); return new BoundingBox(new Vector3(v[0], v[1], v[2]), new Vector3(v[3], v[4], v[5])); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new BoundingBox(objectValue(propertyValues, "Min", Vector3), objectValue(propertyValues, "Max", Vector3)); }
}

export class BoundingSphereConverter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["Center", "Radius"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 4); return new BoundingSphere(new Vector3(v[0], v[1], v[2]), v[3]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new BoundingSphere(objectValue(propertyValues, "Center", Vector3), num(propertyValues, "Radius")); }
}

export class PlaneConverter extends MathTypeConverter {
  public constructor() { super(); this.supportStringConvert = false; this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["Normal", "D"]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new Plane(objectValue(propertyValues, "Normal", Vector3), num(propertyValues, "D")); }
}

export class RayConverter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["Position", "Direction"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 6); return new Ray(new Vector3(v[0], v[1], v[2]), new Vector3(v[3], v[4], v[5])); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new Ray(objectValue(propertyValues, "Position", Vector3), objectValue(propertyValues, "Direction", Vector3)); }
}

export class ColorConverter extends MathTypeConverter {
  public constructor() { super(); this.propertyDescriptions = new ComponentModel.PropertyDescriptorCollection(["R", "G", "B", "A"]); }
  public override ConvertFrom(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown): unknown { const v = numbers(value, culture, 4); return new Color(v[0], v[1], v[2], v[3]); }
  public override ConvertTo(context: ComponentModel.ITypeDescriptorContext, culture: Globalization.CultureInfo, value: unknown, destinationType: XnaType<unknown>): unknown { return convertToString(value, culture, destinationType); }
  public override CreateInstance(context: ComponentModel.ITypeDescriptorContext, propertyValues: Collections.IDictionary): unknown { return new Color(num(propertyValues, "R"), num(propertyValues, "G"), num(propertyValues, "B"), num(propertyValues, "A")); }
}

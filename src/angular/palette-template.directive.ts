import { Directive, TemplateRef, inject } from "@angular/core";
import type { JsonObject, Palette } from "../core";
import type { PickerController, PickerState } from "../editor";

/** Shared context exposed by Angular-owned Colorwheel block templates. */
export interface ColorwheelBlockTemplateContext<Metadata extends object = JsonObject> {
  readonly palette: Palette<Metadata>;
  readonly state: PickerState<Metadata>;
  readonly controller: PickerController<Metadata>;
}

/** Context exposed by an `s9rgColorwheelPalette` template. */
export interface ColorwheelPaletteTemplateContext<
  Metadata extends object = JsonObject
> extends ColorwheelBlockTemplateContext<Metadata> {
  /** Shorthand for `palette`, available through `let-palette`. */
  readonly $implicit: Palette<Metadata>;
  readonly palette: Palette<Metadata>;
  readonly state: PickerState<Metadata>;
  readonly controller: PickerController<Metadata>;
}

/** Context exposed by an `s9rgColorwheelWheel` template. */
export interface ColorwheelWheelTemplateContext<
  Metadata extends object = JsonObject
> extends ColorwheelBlockTemplateContext<Metadata> {
  /** Shorthand for `state`, available through `let-state`. */
  readonly $implicit: PickerState<Metadata>;
}

/**
 * Marks an Angular template as the palette block for `ColorwheelComponent`.
 *
 * @example
 * ```html
 * <s9rg-colorwheel [defaultPalette]="palette">
 *   <ng-template
 *     s9rgColorwheelPalette
 *     let-palette
 *     let-controller="controller"
 *   >
 *     @for (entry of palette.colors; track entry.id) {
 *       <button type="button" (click)="controller.commands.setActive(entry.id)">
 *         {{ entry.name }}
 *       </button>
 *     }
 *   </ng-template>
 * </s9rg-colorwheel>
 * ```
 */
@Directive({
  selector: "ng-template[s9rgColorwheelPalette]",
  standalone: true
})
export class ColorwheelPaletteTemplateDirective<Metadata extends object = JsonObject> {
  readonly templateRef =
    inject<TemplateRef<ColorwheelPaletteTemplateContext<Metadata>>>(TemplateRef);

  static ngTemplateContextGuard<Metadata extends object>(
    directive: ColorwheelPaletteTemplateDirective<Metadata>,
    context: unknown
  ): context is ColorwheelPaletteTemplateContext<Metadata> {
    void directive;
    void context;
    return true;
  }
}

/**
 * Marks an Angular template as the wheel block for `ColorwheelComponent`.
 * The projected view is retained and receives live state instead of being
 * destroyed and recreated for every controller notification.
 */
@Directive({
  selector: "ng-template[s9rgColorwheelWheel]",
  standalone: true
})
export class ColorwheelWheelTemplateDirective<Metadata extends object = JsonObject> {
  readonly templateRef = inject<TemplateRef<ColorwheelWheelTemplateContext<Metadata>>>(TemplateRef);

  static ngTemplateContextGuard<Metadata extends object>(
    directive: ColorwheelWheelTemplateDirective<Metadata>,
    context: unknown
  ): context is ColorwheelWheelTemplateContext<Metadata> {
    void directive;
    void context;
    return true;
  }
}

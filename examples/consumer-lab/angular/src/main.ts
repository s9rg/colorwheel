// @s9rg/colorwheel 1.0.0 escaped Angular's partial-Ivy markers while bundling,
// so Angular CLI's development prebundler misses the linker pass. Keep this
// explicit JIT fallback in the registry consumer until the packaging fix ships.
import "@angular/compiler";
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app.component";

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()]
}).catch((error: unknown) => {
  console.error("Angular consumer failed to start", error);
});

import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app.component";

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()]
}).catch((error: unknown) => {
  console.error("Angular candidate consumer failed to start", error);
});

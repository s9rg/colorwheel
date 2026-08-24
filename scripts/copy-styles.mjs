import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/react/styles.css", import.meta.url),
  new URL("../dist/styles.css", import.meta.url)
);
await copyFile(
  new URL("./styles.css.d.ts.txt", import.meta.url),
  new URL("../dist/styles.css.d.ts", import.meta.url)
);

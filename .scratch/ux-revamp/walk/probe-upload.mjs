import { BASE, launch, settle, done, FIXTURES } from "./helper.mjs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const { browser, page, errors } = await launch(undefined, "auth-teacher.json");
await page.goto(BASE + "/workspace");
await settle(page, 2000);

const fileB64 = await readFile(join(FIXTURES, "fractions-notes.txt"), "base64");
const result = await page.evaluate(async ({ fileB64 }) => {
  const session = await fetch("/api/auth/session").then((r) => r.json());
  const csrf = session.data?.csrf ?? session.csrf;
  const headers = { "x-edu-canvas-csrf": csrf };
  const out = { csrf: Boolean(csrf) };
  const list = await fetch("/api/lessons/sources", { headers });
  out.list = { status: list.status, body: (await list.text()).slice(0, 300) };
  const form = new FormData();
  const bytes = Uint8Array.from(atob(fileB64), (c) => c.charCodeAt(0));
  form.append("source", new File([bytes], "fractions-notes.txt", { type: "text/plain" }));
  form.append("syntheticMaterialConfirmed", "true");
  const up = await fetch("/api/lessons/sources", { method: "POST", headers, body: form });
  out.upload = { status: up.status, body: (await up.text()).slice(0, 500) };
  return out;
}, { fileB64 });
console.log("RESULT", JSON.stringify(result, null, 1));
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));

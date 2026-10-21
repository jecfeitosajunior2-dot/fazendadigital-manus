import { createRequire } from "module";
import { mkdirSync } from "fs";
import { resolve } from "path";
const require = createRequire("C:/Users/PEDRON~1/AppData/Local/Temp/fd-pw/package.json");
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:3010";
const EMAIL = "homolog.3c47@teste.local";
const SENHA = "Homolog3c47!Ui";
const SHOT = resolve(".local-data/homolog-3c47-pay-shots");
mkdirSync(SHOT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${SHOT}/chrome-profile-readonly`],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
try {
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[placeholder="seu@email.com"]');
  await page.type('input[placeholder="seu@email.com"]', EMAIL);
  await page.type('input[placeholder="••••••••"]', SENHA);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find(e => (e.textContent || "").includes("Entrar"));
    el?.click();
  });
  await page.waitForFunction(() => !location.pathname.includes("/entrar"), { timeout: 20000 });
  await page.goto(`${BASE}/financeiro/contas-a-pagar/1`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => (document.body.innerText || "").includes("40,00"), { timeout: 20000 });
  await page.screenshot({ path: `${SHOT}/06-detalhe-oficial.png`, fullPage: true });
  console.log("ok");
} finally {
  await browser.close();
}

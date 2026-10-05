import { createRequire } from "node:module";
import { REPO } from "./common.mjs";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const require = createRequire(REPO + "/package.json");
export const ExcelJS = require("exceljs");

export const DIR = path.join(process.env.TEMP, "p4b5-files");
mkdirSync(DIR, { recursive: true });

export const HEADERS = ["Check / Question", "Priority", "Site", "Target Activity", "Framework", "Framework Item"];
export const EN = "\u2013";

// Independent oracle for the approved identity format (deliberately NOT imported from the app).
export const ID = {
  act1: `2026-10-27 | 09:00 | Viet Long | Site Assessment ${EN} Viet Long`,
  act2: "2026-10-28 | Viet Long | Follow-up Visit",
  act3: "2026-10-28 | Project-wide | Document Review",
  act4: "Undated | Long An | Consulting",
  act5: "Undated | Project-wide | Online Support",
  amb: "2026-11-01 | 10:00 | Long An | Amb Twin",
  beta: "2026-10-27 | 09:00 | Beta Site | Beta Assessment",
};

/** rows: arrays of up to 6 strings in HEADERS order. Returns the file path. */
export async function makeXlsx(name, rows, opts = {}) {
  const { sheetName = "Verification Items", headers = HEADERS, order = null, extraSheets = [], blankGapAfter = null, blankGap = 0 } = opts;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  const colOrder = order ?? headers.map((_, i) => i);
  ws.addRow(colOrder.map((i) => headers[i]));
  let rowNo = 2;
  rows.forEach((r, idx) => {
    if (blankGapAfter !== null && idx === blankGapAfter) rowNo += blankGap;
    const row = ws.getRow(rowNo);
    colOrder.forEach((srcIdx, c) => {
      const v = r[srcIdx] ?? "";
      if (v !== "") row.getCell(c + 1).value = v;
    });
    row.commit();
    rowNo += 1;
  });
  for (const s of extraSheets) {
    const es = wb.addWorksheet(s);
    es.addRow(["junk", "data"]);
  }
  const file = path.join(DIR, name);
  await wb.xlsx.writeFile(file);
  return file;
}

export function writeRaw(name, bytes) {
  const file = path.join(DIR, name);
  writeFileSync(file, bytes);
  return file;
}
export const sizeOf = (file) => statSync(file).size;

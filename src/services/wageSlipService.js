const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const { v4: uuidv4 } = require("uuid");

const templatePath = path.join(__dirname, "../templates/wage-slip-template.xlsx");

const requiredHeaders = [
  "Company Name",
  "Name",
  "S/O",
  "Grade",
  "Emp ID No.",
  "PF No",
  "ESIC No.",
  "Bank A/C",
  "Aadhar",
  "Rate per Day",
  "Total Payable days",
];

const optionalHeaders = [
  "Other Allowance",
];

const aliases = {
  "Company Name": ["company name", "name of company", "company"],
  Name: ["name", "worker name", "name of workman", "workmen"],
  "S/O": ["s/o", "so", "father name", "father's name", "son of"],
  Grade: ["grade", "category", "skill", "skill category"],
  "Emp ID No.": [
    "emp id no.",
    "emp id no",
    "emp id",
    "employee id",
    "id no",
    "token no",
    "emp. id no.",
  ],
  "PF No": ["pf no", "pf no.", "uan", "uan no", "pf"],
  "ESIC No.": ["esic no.", "esic no", "esic", "ip no", "ip number"],
  "Bank A/C": [
    "bank a/c",
    "bank ac",
    "a/c no",
    "account no",
    "bank account",
    "beneficiary ac",
  ],
  Aadhar: ["aadhar", "aadhar no", "aadhaar", "aadhaar no"],
  "Rate per Day": [
    "rate per day",
    "daily rate",
    "basic rate",
    "daily rate of wages",
  ],
  "Total Payable days": [
    "total payable days",
    "payable days",
    "present days",
    "no. of days worked",
    "no of days worked",
    "working days",
  ],
  "Other Allowance": [
    "other allowance",
    "allowance",
    "other allow",
    "extra allowance",
  ],
};

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const aliasSet = (header) =>
  new Set([header, ...(aliases[header] || [])].map(normalize));

const money = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function clone(value) {
  if (value === null || value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function isEmptyObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function cleanCellValue(value) {
  if (value === null || value === undefined) return "";
  if (isEmptyObject(value)) return "";

  if (typeof value === "object") {
    if (value.formula) return value;
    if (value.richText) return value;
    if (value.text) return value.text;
    if (value.result !== undefined && value.result !== null) return value.result;
    if (Object.keys(value).length === 0) return "";
  }

  return value;
}

function readCellValue(cell) {
  const value = cleanCellValue(cell?.value);

  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value.text) return value.text;
  if (typeof value === "object" && value.result != null) return value.result;
  if (typeof value === "object" && value.richText) {
    return value.richText.map((r) => r.text).join("");
  }

  return value;
}

async function readInputSheet(inputPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("No worksheet found in uploaded Excel");

  const headerMap = {};
  const foundHeaders = [];
  const firstRow = sheet.getRow(1);

  firstRow.eachCell((cell, colNumber) => {
    const text = String(readCellValue(cell) || "").trim();
    if (!text) return;

    foundHeaders.push(text);
    const normalizedText = normalize(text);

    [...requiredHeaders, ...optionalHeaders].forEach((header) => {
  if (!headerMap[header] && aliasSet(header).has(normalizedText)) {
    headerMap[header] = colNumber;
  }
});
  });

  const missingHeaders = requiredHeaders.filter((h) => !headerMap[h]);

  return { sheet, headerMap, foundHeaders, missingHeaders };
}

async function validateWorkbookHeaders(inputPath) {
  const { foundHeaders, missingHeaders } = await readInputSheet(inputPath);
  return { foundHeaders, missingHeaders };
}

function getValue(row, headerMap, headerName) {
  const col = headerMap[headerName];
  if (!col) return "";
  return readCellValue(row.getCell(col));
}

function extractWorkers(sheet, headerMap) {
  const workers = [];
  let skippedRows = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const worker = {};

    requiredHeaders.forEach((h) => {
      worker[h] = getValue(row, headerMap, h);
    });

    // Extract optional headers
    optionalHeaders.forEach((h) => {
      worker[h] = getValue(row, headerMap, h) || 0;
    });

    const name = String(worker["Name"] || "").trim();
    const empId = String(worker["Emp ID No."] || "").trim();

    if (!name || !empId) {
      skippedRows += 1;
      return;
    }

    const rate = Number(worker["Rate per Day"] || 0);
    const days = Number(worker["Total Payable days"] || 0);
    const otherAllowance = Number(worker["Other Allowance"] || 0);

    const base = money(rate * days);
    const basic = money(base * 0.0833);
    const bonus = money(base * 0.0673);
    const earningTotal = money(basic + bonus);

    const gross = money(base + earningTotal + otherAllowance);

    // ✅ PF and ESIC calculated on BASE only (not including other allowance)
    const pf = money(base * 0.12);
    const esic = money(base * 0.0075);

    const totalDedt = money(pf + esic);
    const net = money(gross - totalDedt);

    worker.__calc = {
      rate,
      days,
      base,
      basic,
      bonus,
      otherAllowance,
      earningTotal,
      gross,
      pf,
      esic,
      totalDedt,
      net,
    };

    workers.push(worker);
  });

  return { workers, skippedRows };
}

function shiftFormula(formula, offset) {
  if (!formula) return formula;

  return formula.replace(/([A-Z]{1,3})(\d+)/g, (_, col, row) => {
    return `${col}${Number(row) + offset}`;
  });
}

function copyTemplateBlock(source, target, startRow) {
  const rowOffset = startRow - 1;

  target.properties = { ...source.properties };
  target.pageSetup = { ...source.pageSetup };
  target.headerFooter = { ...source.headerFooter };
  target.views = clone(source.views || []);

  source.columns.forEach((column, index) => {
    const targetColumn = target.getColumn(index + 1);
    targetColumn.width = column.width;
    targetColumn.hidden = column.hidden;
    targetColumn.outlineLevel = column.outlineLevel;
    targetColumn.style = clone(column.style || {});
  });

  source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const targetRow = target.getRow(rowNumber + rowOffset);

    targetRow.height = row.height;
    targetRow.hidden = row.hidden;
    targetRow.outlineLevel = row.outlineLevel;
    targetRow.style = clone(row.style || {});

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);

      const value = cleanCellValue(cell.value);

      if (value && typeof value === "object" && value.formula) {
        targetCell.value = {
          formula: shiftFormula(value.formula, rowOffset),
          result: value.result ?? null,
        };
      } else if (value && typeof value === "object") {
        targetCell.value = clone(value);
      } else {
        targetCell.value = value === "{}" ? "" : value;
      }

      targetCell.style = clone(cell.style || {});

      if (cell.numFmt) targetCell.numFmt = cell.numFmt;
      if (cell.font) targetCell.font = clone(cell.font);
      if (cell.alignment) targetCell.alignment = clone(cell.alignment);
      if (cell.border) targetCell.border = clone(cell.border);
      if (cell.fill) targetCell.fill = clone(cell.fill);
      if (cell.protection) targetCell.protection = clone(cell.protection);
    });
  });

  for (const mergeRange of source.model.merges || []) {
    const shiftedRange = mergeRange.replace(
      /([A-Z]{1,3})(\d+)/g,
      (_, col, row) => {
        return `${col}${Number(row) + rowOffset}`;
      }
    );

    target.mergeCells(shiftedRange);
  }
}

function cellWithOffset(sheet, address, startRow) {
  const rowOffset = startRow - 1;
  const match = address.match(/^([A-Z]+)(\d+)$/);

  if (!match) throw new Error(`Invalid cell address: ${address}`);

  const col = match[1];
  const row = Number(match[2]) + rowOffset;

  return sheet.getCell(`${col}${row}`);
}

function rowNo(row, startRow) {
  return row + startRow - 1;
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  if (value === "{}") return "";
  if (isEmptyObject(value)) return "";
  return String(value).trim();
}

function writeSlip(sheet, worker, month, year, startRow) {
  const c = worker.__calc;
  const company = safeText(worker["Company Name"]) || "Aditri Constructions Services";

  const C = (address) => cellWithOffset(sheet, address, startRow);
  const R = (row) => rowNo(row, startRow);

  C("A2").value = company;
  C("D2").value = company;
  C("I2").value = `Month : ${String(month).toUpperCase()}- ${String(year).slice(-2)}`;

  C("D5").value = c.rate;
  C("D6").value = c.days;
  C("D7").value = 0;
  C("D8").value = 0;

  C("D9").value = {
    formula: `SUM(D${R(6)}:D${R(8)})`,
    result: c.days,
  };

  C("D10").value = 0;
  C("G10").value = c.otherAllowance;
  C("D11").value = "Bank";

  C("D12").value = safeText(worker["Bank A/C"]);
  C("D13").value = safeText(worker["Aadhar"]);

  C("B7").value = safeText(worker["Name"]);
  C("B8").value = safeText(worker["S/O"]);
  C("B9").value = safeText(worker["Grade"]);
  C("B10").value = safeText(worker["Emp ID No."]);
  C("B11").value = safeText(worker["PF No"]);
  C("B12").value = safeText(worker["ESIC No."]);

  // BASE = Rate Per Day * Total Payable Days
  C("E5").value = {
    formula: `D${R(5)}*D${R(9)}`,
    result: c.base,
  };

  // Bonus / extra earning
  C("G5").value = {
    formula: `ROUND((E${R(5)}*8.33%)+(E${R(5)}*6.73%),2)`,
    result: c.earningTotal,
  };

  // Gross = Base + Bonus
  C("H5").value = {
    formula: `E${R(5)}+G${R(5)}`,
    result: c.gross,
  };

  C("H6").value = 0;
  C("H7").value = 0;
  C("H8").value = 0;
  C("H9").value = 0;
  C("H10").value = {
    formula: `E${R(5)}+G${R(5)}+G${R(10)}`,
    result: c.gross,
  };

  C("H11").value = {
    formula: `SUM(G${R(5)}:G${R(10)})+E${R(5)})`,
    result: c.gross,
  };

  // ✅ FIXED: PF on BASE, not GROSS
  C("J5").value = {
    formula: `ROUND(H${R(5)}*12%,2)`,
    result: c.pf,
  };

  // ✅ FIXED: ESIC on BASE, not GROSS
  C("J6").value = {
    formula: `ROUND(H${R(5)}*0.75%,2)`,
    result: c.esic,
  };

  C("J7").value = 0;
  C("J8").value = 0;
  C("J9").value = 0;
  C("J10").value = 0;

  C("J11").value = {
    formula: `SUM(J${R(5)}:J${R(10)})`,
    result: c.totalDedt,
  };

  C("J12").value = {
    formula: `H${R(11)}-J${R(11)}`,
    result: c.net,
  };
}

function removeCurlyBracesFromSheet(sheet) {
  sheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (cell.value === "{}" || isEmptyObject(cell.value)) {
        cell.value = "";
      }
    });
  });
}

async function createWageSlipWorkbook({
  inputPath,
  month,
  year,
  allowMissingHeaders,
}) {
  const { sheet, headerMap, missingHeaders } = await readInputSheet(inputPath);

  if (missingHeaders.length && !allowMissingHeaders) {
    const err = new Error(`Missing headers: ${missingHeaders.join(", ")}`);
    err.status = 400;
    err.missingHeaders = missingHeaders;
    throw err;
  }

  const { workers, skippedRows } = extractWorkers(sheet, headerMap);

  if (!workers.length) {
    const err = new Error(
      "No valid worker rows found. Name and Emp ID No. are required."
    );
    err.status = 400;
    throw err;
  }

  const templateWorkbook = new ExcelJS.Workbook();
  await templateWorkbook.xlsx.readFile(templatePath);

  const templateSheet = templateWorkbook.worksheets[0];
  if (!templateSheet) throw new Error("Template worksheet not found");

  const outputWorkbook = new ExcelJS.Workbook();

  outputWorkbook.creator = "Wage Slip Generator";
  outputWorkbook.created = new Date();
  outputWorkbook.modified = new Date();

  outputWorkbook.calcProperties.fullCalcOnLoad = true;
  outputWorkbook.calcProperties.forceFullCalc = true;

  const outputSheet = outputWorkbook.addWorksheet("Wage Slips");

  const templateRowCount = templateSheet.rowCount || 15;
  const gapRows = 2;

  workers.forEach((worker, index) => {
    const startRow = index * (templateRowCount + gapRows) + 1;

    copyTemplateBlock(templateSheet, outputSheet, startRow);
    writeSlip(outputSheet, worker, month, year, startRow);
  });

  removeCurlyBracesFromSheet(outputSheet);

  const generatedDir = path.resolve("generated");

  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  const fileName = `single-sheet-wage-slips-${month}-${year}-${uuidv4()}.xlsx`;
  const filePath = path.join(generatedDir, fileName);

  await outputWorkbook.xlsx.writeFile(filePath);

  return {
    filePath,
    fileName,
    workersCount: workers.length,
    skippedRows,
  };
}
module.exports = {
  requiredHeaders,
  optionalHeaders,
  validateWorkbookHeaders,
  createWageSlipWorkbook
};

'use strict';
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { ZipArchive } = require('archiver');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const UTRRecord = require('../models/UTRRecord');

const idbiLogoCandidates = [
  path.join(__dirname, '../../../frontend/public/IDBI_logo.png'),
  path.join(process.cwd(), '../frontend/public/IDBI_logo.png'),
  path.join(process.cwd(), 'frontend/public/IDBI_logo.png'),
];

const getIdbiLogoPath = () => idbiLogoCandidates.find((logoPath) => fs.existsSync(logoPath));

const requiredHeaders = [
  'Beneficiary Name',
  'Beneficiary Account',
  'Beneficiary IFSC Code',
  'Amount',
  'Payment Remarks',
];

const aliases = {
  'Beneficiary Name': ['beneficiary name', 'name', 'beneficiary'],
  'Beneficiary Account': [
    'beneficiary account',
    'account',
    'account number',
    'ac no',
    'bank account',
    'beneficiary ac',
  ],
  'Beneficiary IFSC Code': ['beneficiary ifsc code', 'ifsc code', 'ifsc'],
  Amount: ['amount', 'transaction amount', 'value'],
  'Payment Remarks': ['payment remarks', 'remarks', 'remark', 'description', 'note'],
};

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const aliasSet = (header) => new Set([header, ...(aliases[header] || [])].map(normalize));

function cleanCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.text) return value.text;
    if (value.richText) return value.richText.map((part) => part.text).join('');
    if (value.result !== undefined && value.result !== null) return value.result;
    if (value.formula) return value.result || '';
  }
  return value;
}

function readCellValue(cell) {
  return cleanCellValue(cell?.value);
}

async function readReceiptSheet(inputPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new Error('No worksheet found in uploaded Excel');
  }

  const headerMap = {};
  const foundHeaders = [];
  const firstRow = sheet.getRow(1);

  firstRow.eachCell((cell, colNumber) => {
    const text = String(readCellValue(cell) || '').trim();
    if (!text) return;
    foundHeaders.push(text);
    const normalizedText = normalize(text);

    requiredHeaders.forEach((header) => {
      if (!headerMap[header] && aliasSet(header).has(normalizedText)) {
        headerMap[header] = colNumber;
      }
    });
  });

  const missingHeaders = requiredHeaders.filter((h) => !headerMap[h]);
  return { sheet, headerMap, foundHeaders, missingHeaders };
}

async function validateReceiptWorkbookHeaders(inputPath) {
  const { foundHeaders, missingHeaders } = await readReceiptSheet(inputPath);
  return { foundHeaders, missingHeaders };
}

function getValue(row, headerMap, headerName) {
  const col = headerMap[headerName];
  if (!col) return '';
  return readCellValue(row.getCell(col));
}

function parseAmount(value) {
  if (value === null || value === undefined) return '';
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  return cleaned === '' ? '' : Number(cleaned);
}

function parseTimeString(value) {
  if (!value) return null;
  const input = String(value).trim().toLowerCase();
  const ampmMatch = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2] || '0');
    const period = ampmMatch[3].toLowerCase();
    if (hour === 12) hour = period === 'am' ? 0 : 12;
    if (period === 'pm' && hour < 12) hour += 12;
    return hour * 60 + minute;
  }

  const hhmmMatch = input.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hour = Number(hhmmMatch[1]);
    const minute = Number(hhmmMatch[2]);
    return hour * 60 + minute;
  }

  const numericMatch = input.match(/^(\d{1,2})$/);
  if (numericMatch) {
    const hour = Number(numericMatch[1]);
    return hour * 60;
  }

  return null;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  const dmyMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    return new Date(year, month, day);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatTime(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const isPM = hours >= 12;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(hour12)}:${pad(minutes)}:${pad(seconds)} ${isPM ? 'PM' : 'AM'}`;
}

function generateRandomUTR() {
  const digits = (count) => Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join('');
  return `0${digits(3)}i${digits(11)}`;
}

async function createUniqueUTR() {
  for (;;) {
    const utr = generateRandomUTR();
    try {
      await UTRRecord.create({ utr });
      return utr;
    } catch (err) {
      if (err.code === 11000) continue;
      throw err;
    }
  }
}

function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9-_\.]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 120);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatAmount(value) {
  const amount = Number(value || 0);
  if (Number.isNaN(amount)) return String(value || '');
  return amount.toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function buildReceiptPdf({
  filePath,
  remitterName,
  remitterAccount,
  paymentMode,
  transactionDateText,
  transactionTimeText,
  beneficiaryName,
  beneficiaryAccount,
  beneficiaryIFSC,
  amountText,
  paymentRemarks,
  utr,
  paymentStatus,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = doc.page.width;
    const border = {
      x: 34,
      y: 31,
      width: pageWidth - 68,
      height: 678,
    };
    const contentX = 64;
    const contentWidth = pageWidth - 128;
    const centerX = pageWidth / 2;

    doc.rect(border.x, border.y, border.width, border.height)
      .lineWidth(0.8)
      .strokeColor('#cfcfcf')
      .stroke();

    const logoPath = getIdbiLogoPath();
    const logoX = centerX - 51;
    const logoY = 48;
    if (logoPath) {
      doc.image(logoPath, logoX, logoY, { width: 102 });
    } else {
      doc.rect(logoX, logoY, 102, 22).fillColor('#00834f').fill();
      doc.circle(logoX + 14, logoY + 11, 8).fillColor('#f58220').fill();
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff').text('IDBI BANK', logoX + 27, logoY + 4, {
        width: 68,
        align: 'left',
        characterSpacing: -0.2,
      });
    }
    doc.font('Helvetica-Bold').fontSize(6.4).fillColor('#111111').text('Bank Aisa Dost Jaisa', logoX, 75, {
      characterSpacing: 1.3,
      width: 102,
      align: 'center',
      lineBreak: false,
    });

    doc.font('Helvetica-Bold').fontSize(14.5).fillColor('#2a2a2a').text(
      'e-Receipt for Transaction through Mobile Banking',
      contentX,
      108,
      { width: contentWidth, align: 'center' }
    );
    const tollLabel = 'Toll Free Number:';
    const tollNumber = '18002094324';
    doc.font('Helvetica-Bold').fontSize(11.2);
    const tollLabelWidth = doc.widthOfString(tollLabel);
    doc.font('Helvetica').fontSize(11.2);
    const tollNumberWidth = doc.widthOfString(tollNumber);
    const tollX = centerX - ((tollLabelWidth + 4 + tollNumberWidth) / 2);
    doc.font('Helvetica-Bold').fontSize(11.2).fillColor('#111111').text(tollLabel, tollX, 137, {
      lineBreak: false,
    });
    doc.font('Helvetica').fontSize(11.2).fillColor('#111111').text(tollNumber, tollX + tollLabelWidth + 4, 137, {
      lineBreak: false,
    });

    doc.strokeColor('#f58220').lineWidth(1.6)
      .moveTo(contentX, 158)
      .lineTo(contentX + contentWidth, 158)
      .stroke();

    const rowX = 86;
    const rowWidth = pageWidth - 172;
    const labelX = 94;
    const valueX = 305;
    const rowHeight = 38.4;
    let rowY = 187;
    const textOffsetY = 15.2;
    const rowFontSize = 11.2;
    const fieldValues = [
      ['Date of Transaction', `${transactionDateText} - ${transactionTimeText}`],
      ['Remitter Name', remitterName],
      ['Remitter Account', remitterAccount],
      ['Beneficiary Name', beneficiaryName],
      ['Beneficiary Account', beneficiaryAccount],
      ['Beneficiary IFSC Code', beneficiaryIFSC],
      ['Amount', amountText],
      ['Payment Mode', paymentMode],
      ['Payment Remarks', paymentRemarks || ''],
      ['UTR Number', utr],
      ['Payment Status', paymentStatus],
    ];

    fieldValues.forEach(([label, value]) => {
      doc.strokeColor('#d4d4d4').lineWidth(0.55)
        .moveTo(rowX, rowY + rowHeight)
        .lineTo(rowX + rowWidth, rowY + rowHeight)
        .stroke();

      doc.font('Helvetica').fontSize(rowFontSize).fillColor('#111111').text(label, labelX, rowY + textOffsetY, {
        width: 160,
        align: 'left',
      });
      doc.font(label === 'Amount' ? 'Helvetica-Bold' : 'Helvetica').fontSize(rowFontSize).fillColor('#111111').text(String(value || ''), valueX, rowY + textOffsetY, {
        width: rowX + rowWidth - valueX,
        align: 'left',
      });

      rowY += rowHeight;
    });

    const disclaimerY = 653;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text('*Disclaimer - ', contentX, disclaimerY, {
      continued: true,
    });
    doc.font('Helvetica').fontSize(11).fillColor('#111111').text(
      'This is an electronically generated receipt of Transaction confirmation from IDBI Bank.',
      { continued: false, width: contentWidth }
    );
    doc.font('Helvetica').fontSize(11).fillColor('#111111').text(
      'For actual receipt of the funds, kindly check with the Beneficiary/Beneficiary Bank.',
      contentX,
      disclaimerY + 16,
      { width: contentWidth }
    );

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

async function createPaymentReceiptZip({
  inputPath,
  remitterName,
  remitterAccount,
  paymentMode,
  transactionDate,
  timeRangeStart,
  timeRangeEnd,
}) {
  if (!inputPath) {
    throw new Error('Excel file path is required');
  }

  const { sheet, headerMap, missingHeaders } = await readReceiptSheet(inputPath);
  if (missingHeaders.length) {
    const error = new Error(`Missing headers: ${missingHeaders.join(', ')}`);
    error.status = 400;
    throw error;
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const beneficiaryName = String(getValue(row, headerMap, 'Beneficiary Name') || '').trim();
    const beneficiaryAccount = String(getValue(row, headerMap, 'Beneficiary Account') || '').trim();
    const beneficiaryIFSC = String(getValue(row, headerMap, 'Beneficiary IFSC Code') || '').trim();
    const amount = parseAmount(getValue(row, headerMap, 'Amount'));
    const paymentRemarks = String(getValue(row, headerMap, 'Payment Remarks') || '').trim();

    if (!beneficiaryName || !beneficiaryAccount || !beneficiaryIFSC || amount === '') {
      return;
    }

    rows.push({
      beneficiaryName,
      beneficiaryAccount,
      beneficiaryIFSC,
      amount,
      paymentRemarks,
    });
  });

  if (!rows.length) {
    const error = new Error('Excel file must contain at least one valid row with beneficiary details.');
    error.status = 400;
    throw error;
  }

  const baseDate = parseDateValue(transactionDate);
  if (!baseDate) {
    const error = new Error('Valid transaction date is required. Use YYYY-MM-DD or DD/MM/YYYY format.');
    error.status = 400;
    throw error;
  }

  const startMinutes = parseTimeString(timeRangeStart || '1pm');
  const endMinutes = parseTimeString(timeRangeEnd || '5pm');

  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    const error = new Error('Valid time range is required. Example: 1pm to 5pm or 13:00 to 17:00.');
    error.status = 400;
    throw error;
  }

  const generatedDir = path.resolve('generated', 'payment-receipts');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  const pdfFiles = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const utr = await createUniqueUTR();

    const receiptDate = new Date(baseDate.getTime());
    const randomMinute = randomBetween(startMinutes, endMinutes);
    receiptDate.setHours(0, 0, 0, 0);
    receiptDate.setMinutes(randomMinute);
    receiptDate.setSeconds(Math.floor(Math.random() * 60));

    const transactionDateText = formatDate(receiptDate);
    const transactionTimeText = formatTime(receiptDate);
    const amountText = formatAmount(row.amount);

    const safeName = sanitizeFileName(`${row.beneficiaryName || 'beneficiary'}_${row.beneficiaryAccount || index + 1}`);
    const pdfName = `receipt-${safeName}-${utr}.pdf`;
    const pdfPath = path.join(generatedDir, pdfName);

    await buildReceiptPdf({
      filePath: pdfPath,
      remitterName,
      remitterAccount,
      paymentMode,
      transactionDateText,
      transactionTimeText,
      beneficiaryName: row.beneficiaryName,
      beneficiaryAccount: row.beneficiaryAccount,
      beneficiaryIFSC: row.beneficiaryIFSC,
      amountText,
      paymentRemarks: row.paymentRemarks,
      utr,
      paymentStatus: 'Success',
    });

    pdfFiles.push(pdfPath);
  }

  const zipFileName = `transaction-receipts-${uuidv4()}.zip`;
  const zipFilePath = path.join(generatedDir, zipFileName);
  const output = fs.createWriteStream(zipFilePath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  archive.pipe(output);
  pdfFiles.forEach((filePath) => {
    archive.file(filePath, { name: path.basename(filePath) });
  });
  await archive.finalize();

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  pdfFiles.forEach((filePath) => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  return {
    zipFilePath,
    zipFileName,
    count: pdfFiles.length,
  };
}

module.exports = {
  validateReceiptWorkbookHeaders,
  createPaymentReceiptZip,
};

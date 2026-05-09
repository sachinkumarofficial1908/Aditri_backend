'use strict';
const xlsx = require('xlsx');

const formatDayLabel = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${day}-${month}`;
};

const getMonthDays = (month, year) => new Date(year, month, 0).getDate();

const BORDER_STYLE = { style: 'thin', color: { rgb: 'FF404040' } };
const HEADER_FILL = { fgColor: { rgb: 'FF1E40AF' } };
const HEADER_FONT = { name: 'Lucida Bright', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } };
const BODY_FONT = { name: 'Lucida Bright', sz: 10, color: { rgb: 'FF1F2937' } };

const getCellStyle = ({ horizontal = 'left', vertical = 'center', bold = false, fill = null } = {}) => ({
  font: { ...BODY_FONT, bold },
  alignment: { horizontal, vertical },
  border: {
    top: BORDER_STYLE,
    bottom: BORDER_STYLE,
    left: BORDER_STYLE,
    right: BORDER_STYLE,
  },
  ...(fill ? { fill } : {}),
});

const applyRowStyles = (worksheet, rowIndex, columnCount, styleFn) => {
  for (let col = 0; col < columnCount; col += 1) {
    const cellAddress = xlsx.utils.encode_cell({ r: rowIndex, c: col });
    if (!worksheet[cellAddress]) continue;
    worksheet[cellAddress].s = styleFn(col);
  }
};

const applyWorksheetStyles = (worksheet, rowCount, columnCount, rightAlignColumns = []) => {
  const headerStyle = getCellStyle({ horizontal: 'center', vertical: 'center', bold: true, fill: HEADER_FILL });
  const textStyle = getCellStyle({ horizontal: 'left', vertical: 'center' });
  const centerStyle = getCellStyle({ horizontal: 'center', vertical: 'center' });
  const rightStyle = getCellStyle({ horizontal: 'right', vertical: 'center' });

  applyRowStyles(worksheet, 0, columnCount, () => headerStyle);

  for (let row = 1; row < rowCount; row += 1) {
    applyRowStyles(worksheet, row, columnCount, (col) => {
      if (rightAlignColumns.includes(col)) return rightStyle;
      if (col === 0 || col === 1 || col === 2) return textStyle;
      return centerStyle;
    });
  }
};

const setColumnWidths = (worksheet, columnCount) => {
  const cols = [];
  cols[0] = { wch: 12 };
  cols[1] = { wch: 24 };
  cols[2] = { wch: 14 };

  for (let idx = 3; idx < columnCount; idx += 1) {
    cols[idx] = { wch: 12 };
  }

  worksheet['!cols'] = cols;
};

const ID_HEADERS = new Set(['id', 'employee id', 'emp id']);
const NAME_HEADERS = new Set(['name', 'employee name', 'employee']);
const PRESENT_HEADERS = new Set([
  'present days',
  'presentdays',
  'present day',
  'present',
  'days present',
  'dayspresent',
]);

const validateInteger = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || Number.isNaN(number)) return null;
  const integer = Math.trunc(number);
  return integer >= 0 ? integer : null;
};

const parseHolidayDays = (input, minDay, maxDay) => {
  const holidays = new Set();
  if (!input || typeof input !== 'string') return holidays;

  const entries = input.split(',').map((value) => value.trim()).filter(Boolean);
  for (const entry of entries) {
    if (entry.includes('-')) {
      const [start, end] = entry.split('-').map((value) => validateInteger(value.trim()));
      if (start === null || end === null || start < minDay || end < minDay || start > maxDay || end > maxDay || start > end) {
        throw new Error('Holiday dates must be valid day numbers or ranges within the selected month');
      }
      for (let day = start; day <= end; day += 1) {
        holidays.add(day);
      }
    } else {
      const day = validateInteger(entry);
      if (day === null || day < minDay || day > maxDay) {
        throw new Error('Holiday dates must be valid day numbers or ranges within the selected month');
      }
      holidays.add(day);
    }
  }

  return holidays;
};

const normalizeHeader = (value) => {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase();
};

const isHeaderRow = (row) => {
  if (!Array.isArray(row)) return false;

  const normalized = row.map((value) => normalizeHeader(value));
  const hasName = normalized.some((value) => NAME_HEADERS.has(value));
  const hasPresent = normalized.some((value) => PRESENT_HEADERS.has(value));

  return hasName && hasPresent;
};

const parseExcelRows = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Excel file must contain at least one sheet');

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Excel file must contain at least one row');
  }

  const headerRowIndex = rows.findIndex(isHeaderRow);
  if (headerRowIndex === -1) {
    throw new Error('Excel must contain headers: Name and Present Days');
  }

  const headers = rows[headerRowIndex];
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const idIndex = normalizedHeaders.findIndex((value) => ID_HEADERS.has(value));
  const nameIndex = normalizedHeaders.findIndex((value) => NAME_HEADERS.has(value));
  const presentIndex = normalizedHeaders.findIndex((value) => PRESENT_HEADERS.has(value));

  if (nameIndex === -1 || presentIndex === -1) {
    throw new Error('Excel must contain headers: Name and Present Days');
  }

  const employees = rows
    .slice(headerRowIndex + 1)
    .map((row) => {
      const id = idIndex >= 0 ? String(row[idIndex] ?? '').trim() : '';
      const name = String(row[nameIndex] ?? '').trim();
      const presentDays = validateInteger(row[presentIndex]) ?? 0;
      return { id, name, presentDays };
    })
    .filter((row) => row.name.length > 0);

  if (!employees.length) {
    throw new Error('Excel file must contain at least one employee row');
  }

  return employees;
};

const buildPresentBlocks = (presentDays, availableDays) => {
  if (presentDays <= 6) return [presentDays];

  const absentDays = Math.max(0, availableDays - presentDays);
  const maxBlocks = Math.min(4, presentDays, absentDays + 1);
  const targetBlocks = Math.min(Math.ceil(presentDays / 5), maxBlocks);
  const blockCount = Math.max(1, targetBlocks);
  const baseSize = Math.floor(presentDays / blockCount);
  const remainder = presentDays % blockCount;

  return Array.from({ length: blockCount }, (_, index) => baseSize + (index < remainder ? 1 : 0));
};

const generateWorkingSequence = (availableDays, presentDays) => {
  if (presentDays <= 0) return Array(availableDays).fill('A');
  if (presentDays >= availableDays) return Array(availableDays).fill('P');

  const blocks = buildPresentBlocks(presentDays, availableDays);
  const absentDays = availableDays - presentDays;
  const gapCount = blocks.length + 1;
  const gaps = Array(gapCount).fill(0);

  const baseGap = Math.floor(absentDays / gapCount);
  let remainingAbsents = absentDays % gapCount;

  for (let i = 0; i < gapCount; i += 1) {
    gaps[i] = baseGap + (remainingAbsents > 0 ? 1 : 0);
    remainingAbsents -= 1;
  }

  const sequence = [];
  sequence.push(...Array(gaps[0]).fill('A'));

  blocks.forEach((blockSize, index) => {
    sequence.push(...Array(blockSize).fill('P'));
    sequence.push(...Array(gaps[index + 1]).fill('A'));
  });

  if (sequence.length !== availableDays) {
    if (sequence.length < availableDays) {
      sequence.push(...Array(availableDays - sequence.length).fill('A'));
    } else {
      sequence.length = availableDays;
    }
  }

  return sequence;
};

const buildAttendanceRow = ({ id, name, presentDays }, dateColumns, workSequence) => {
  const row = [id || '', name, presentDays];
  let workingIndex = 0;

  dateColumns.forEach((column) => {
    if (column.isHoliday) {
      row.push('Holiday');
    } else if (column.isSunday) {
      row.push('Rest');
    } else {
      row.push(workSequence[workingIndex] || 'A');
      workingIndex += 1;
    }
  });

  return row;
};

exports.generateMusterRoll = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Excel file is required' });

    const month = validateInteger(req.body.month);
    const year = validateInteger(req.body.year);
    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({ success: false, message: 'Valid month and year are required' });
    }

    const daysInMonth = getMonthDays(month, year);
    const fromDayInput = validateInteger(req.body.fromDay) || 1;
    const toDayInput = validateInteger(req.body.toDay) || daysInMonth;
    const fromDay = Math.max(1, Math.min(fromDayInput, daysInMonth));
    const toDay = Math.max(fromDay, Math.min(toDayInput, daysInMonth));
    const holidayDates = parseHolidayDays(req.body.holidayDates || '', fromDay, toDay);

    const employees = parseExcelRows(req.file.buffer);
    const dateColumns = [];

    for (let date = fromDay; date <= toDay; date += 1) {
      const current = new Date(year, month - 1, date);
      dateColumns.push({
        label: formatDayLabel(current),
        isSunday: current.getDay() === 0,
        isHoliday: holidayDates.has(date),
      });
    }

    const availableWorkdays = dateColumns.filter((d) => !d.isSunday && !d.isHoliday).length;
    const rows = employees.map((employee) => {
      const requestedPresentDays = Math.max(0, employee.presentDays);
      let presentDays = requestedPresentDays;
      let remark = '';

      if (requestedPresentDays > availableWorkdays) {
        presentDays = availableWorkdays;
        remark = 'Present days exceed working days';
      }

      const workingSequence = generateWorkingSequence(availableWorkdays, presentDays);
      return buildAttendanceRow({ ...employee, presentDays, remark }, dateColumns, workingSequence);
    });

    const headers = ['ID', 'Name', 'Present Days', ...dateColumns.map((col) => col.label)];
    const worksheetData = [headers, ...rows];
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);

    const columnCount = headers.length;
    const rowCount = worksheetData.length;
    applyWorksheetStyles(worksheet, rowCount, columnCount, [2]);
    setColumnWidths(worksheet, columnCount);

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Muster Roll');
    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer', cellStyles: true });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="muster-roll-${String(month).padStart(2, '0')}-${year}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

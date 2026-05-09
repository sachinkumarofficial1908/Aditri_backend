'use strict';
const xlsx = require('xlsx');

const ID_HEADERS = new Set(['id', 'emp id', 'employee id', 'employeeid', 'employee']);
const NAME_HEADERS = new Set(['name', 'employee name', 'workmen', 'worker', 'employee']);
const PRESENT_HEADERS = new Set([
  'present days',
  'presentdays',
  'present day',
  'present',
  'days present',
  'dayspresent',
  'no of days present',
  'noofdayspresent',
]);

const ATTENDANCE_TRUE = new Set(['p', 'present', 'yes', 'y', '1']);
const ATTENDANCE_FALSE = new Set(['a', 'absent', 'no', 'n', '0']);

const normalizeHeader = (value) => {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase();
};

const validateInteger = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || Number.isNaN(number)) return null;
  const integer = Math.trunc(number);
  return integer >= 0 ? integer : null;
};

const parseTimeToMinutes = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim();
  const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (twelveHourMatch) {
    let hour = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const period = twelveHourMatch[3].toLowerCase();
    if (hour === 12) hour = period === 'am' ? 0 : 12;
    if (period === 'pm') hour += 12;
    return hour * 60 + minutes;
  }

  const twentyFourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourMatch) {
    const hour = Number(twentyFourMatch[1]);
    const minutes = Number(twentyFourMatch[2]);
    if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return null;
    return hour * 60 + minutes;
  }

  return null;
};

const formatMinutesToTime = (minutes) => {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, Math.trunc(minutes)));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelveHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
};

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
  cols[1] = { wch: 22 };
  cols[2] = { wch: 18 };

  for (let idx = 3; idx < columnCount; idx += 1) {
    cols[idx] = { wch: 10 };
  }

  worksheet['!cols'] = cols;
};

const getMonthDays = (month, year) => new Date(year, month, 0).getDate();

const isDateHeader = (value) => {
  const normalized = normalizeHeader(value);
  if (!/^[0-9]{1,2}$/.test(normalized)) return false;
  const day = Number(normalized);
  return day >= 1 && day <= 31;
};

const normalizeAttendanceCell = (value) => {
  if (value === undefined || value === null) return '';
  const normalized = String(value).trim().toLowerCase();
  if (ATTENDANCE_TRUE.has(normalized)) return 'P';
  if (ATTENDANCE_FALSE.has(normalized)) return 'A';
  return '';
};

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
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

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const shuffleArray = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const parseExcelRows = (buffer, daysInMonth) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return { errors: ['Excel file must contain at least one sheet'] };
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!Array.isArray(rows) || rows.length === 0) {
    return { errors: ['Excel file must contain at least one row'] };
  }

  const headerRowIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const normalized = row.map(normalizeHeader);
    const hasName = normalized.some((value) => NAME_HEADERS.has(value));
    const hasPresent = normalized.some((value) => PRESENT_HEADERS.has(value));
    return hasName && hasPresent;
  });

  if (headerRowIndex === -1) {
    return { errors: ['Excel must contain headers for ID, Name, and Present Days'] };
  }

  const headers = rows[headerRowIndex];
  const normalizedHeaders = headers.map(normalizeHeader);
  const idIndex = normalizedHeaders.findIndex((value) => ID_HEADERS.has(value));
  const nameIndex = normalizedHeaders.findIndex((value) => NAME_HEADERS.has(value));
  const presentIndex = normalizedHeaders.findIndex((value) => PRESENT_HEADERS.has(value));

  if (nameIndex === -1 || presentIndex === -1) {
    return { errors: ['Excel must contain headers for Name and Present Days'] };
  }

  const rawDateColumns = normalizedHeaders
    .map((value, index) => ({ value, index }))
    .filter((item) => isDateHeader(item.value))
    .map((item) => ({ day: Number(item.value), index: item.index }));

  const invalidDayHeaders = rawDateColumns.filter((item) => item.day < 1 || item.day > daysInMonth);
  if (invalidDayHeaders.length > 0) {
    return { errors: ['Date headers must match the selected month. Invalid day headers were found.'] };
  }

  const dateColumns = rawDateColumns
    .filter((item) => item.day >= 1 && item.day <= daysInMonth)
    .sort((a, b) => a.day - b.day);

  const expectedDayCount = dateColumns.length > 0 ? new Set(dateColumns.map((item) => item.day)).size : 0;
  if (dateColumns.length > 0 && expectedDayCount !== dateColumns.length) {
    return { errors: ['Duplicate or invalid date headers found in the uploaded file'] };
  }

  const employees = [];
  const duplicateMap = new Map();

  rows.slice(headerRowIndex + 1).forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    const id = idIndex >= 0 ? String(row[idIndex] ?? '').trim() : '';
    const name = String(row[nameIndex] ?? '').trim();
    const presentDays = validateInteger(row[presentIndex]);
    const hasValue = id || name || row[presentIndex] !== undefined && row[presentIndex] !== '';

    if (!hasValue) return;

    const dates = dateColumns.length > 0
      ? Array.from({ length: daysInMonth }, (_, dayIndex) => {
          const column = dateColumns.find((item) => item.day === dayIndex + 1);
          return normalizeAttendanceCell(row[column?.index]);
        })
      : [];

    employees.push({ id, name, presentDays, dates });
    if (id) {
      duplicateMap.set(id, (duplicateMap.get(id) || 0) + 1);
    }
  });

  const rowWarnings = [];
  duplicateMap.forEach((count, id) => {
    if (count > 1) {
      rowWarnings.push({ type: 'duplicate', message: `Duplicate ID detected: ${id}` });
    }
  });

  return {
    headers,
    idIndex,
    nameIndex,
    presentIndex,
    dateColumns,
    employees,
    warnings: rowWarnings,
    errors: [],
  };
};

const validateFileSettings = (file, settings) => {
  if (!file) {
    return { errors: ['Excel file is required'], warnings: [], valid: false };
  }

  const month = validateInteger(settings.month);
  const year = validateInteger(settings.year);
  if (!month || month < 1 || month > 12 || !year) {
    return { errors: ['Valid month and year are required'], warnings: [], valid: false };
  }

  const uploadType = settings.uploadType === 'existing' ? 'existing' : 'basic';
  const daysInMonth = getMonthDays(month, year);
  const parseResult = parseExcelRows(file.buffer, daysInMonth);
  if (parseResult.errors.length) {
    return { errors: parseResult.errors, warnings: parseResult.warnings || [], valid: false };
  }

  const errors = [];
  const warnings = [...(parseResult.warnings || [])];

  if (uploadType === 'basic' && parseResult.dateColumns.length > 0) {
    errors.push('Selected Basic Sheet but file contains date columns. Use Existing Muster Roll or remove the date columns.');
  }

  if (uploadType === 'existing') {
    if (parseResult.dateColumns.length === 0) {
      errors.push('Selected Existing Muster Roll but no date columns were detected. The file must include date columns for the selected month.');
    } else if (parseResult.dateColumns.length !== daysInMonth) {
      errors.push(`Existing muster roll must include date columns for all days of the selected month (${daysInMonth} days).`);
    } else {
      const expectedDays = Array.from({ length: daysInMonth }, (_, idx) => idx + 1);
      const actualDays = parseResult.dateColumns.map((item) => item.day);
      for (let i = 0; i < expectedDays.length; i += 1) {
        if (expectedDays[i] !== actualDays[i]) {
          errors.push(`Existing muster roll date headers must match days 1 through ${daysInMonth}.`);
          break;
        }
      }
    }
  }

  const previewRows = parseResult.employees.slice(0, 10).map((employee) => {
    const actualPresent = employee.dates.filter((value) => value === 'P').length;
    return {
      id: employee.id,
      name: employee.name,
      presentDays: employee.presentDays,
      actualPresent,
      dates: employee.dates.slice(0, 10),
    };
  });

  if (parseResult.employees.length === 0) {
    errors.push('Excel file must contain at least one employee record');
  }

  const rowWarnings = [];
  const idCounts = new Map();
  parseResult.employees.forEach((employee) => {
    if (employee.id) {
      idCounts.set(employee.id, (idCounts.get(employee.id) || 0) + 1);
    }
  });
  idCounts.forEach((count, id) => {
    if (count > 1) {
      rowWarnings.push({ type: 'duplicate', message: `Duplicate ID found: ${id}` });
    }
  });

  parseResult.employees.forEach((employee) => {
    if (!employee.id) {
      errors.push(`Employee record missing ID for Name "${employee.name || 'Unknown'}".`);
    }
    if (!employee.name) {
      errors.push(`Employee record missing Name for ID "${employee.id || 'Unknown'}".`);
    }
    if (employee.presentDays === null) {
      errors.push(`Present Days must be a number for ${employee.name || employee.id || 'one of the rows'}.`);
    }
    if (employee.presentDays !== null && employee.presentDays < 0) {
      errors.push(`Present Days must be zero or greater for ${employee.name || employee.id}.`);
    }
  });

  if (uploadType === 'existing') {
    parseResult.employees.forEach((employee) => {
      const actualPresent = employee.dates.filter((value) => value === 'P').length;
      if (employee.presentDays !== null && actualPresent !== employee.presentDays) {
        warnings.push({
          type: 'mismatch',
          message: `Present days mismatch for ID ${employee.id || 'Unknown'} (${employee.name || 'Unknown'}): expected ${employee.presentDays}, actual ${actualPresent}`,
          id: employee.id,
          name: employee.name,
          expected: employee.presentDays,
          actual: actualPresent,
        });
      }
    });
  }

  const valid = errors.length === 0;

  return {
    uploadType,
    month,
    year,
    daysInMonth,
    headers: parseResult.headers,
    employeeCount: parseResult.employees.length,
    previewRows,
    errors,
    warnings: [...warnings, ...rowWarnings],
    valid,
  };
};

const buildDayColumns = (month, year) => {
  const totalDays = getMonthDays(month, year);
  return Array.from({ length: totalDays }, (_, index) => {
    const dateNumber = index + 1;
    return {
      day: dateNumber,
      isSunday: new Date(year, month - 1, dateNumber).getDay() === 0,
    };
  });
};

const validateTimingSettings = ({ entryStart, entryEnd, exitStart, exitEnd }) => {
  const entryStartMinutes = parseTimeToMinutes(entryStart);
  const entryEndMinutes = parseTimeToMinutes(entryEnd);
  const exitStartMinutes = parseTimeToMinutes(exitStart);
  const exitEndMinutes = parseTimeToMinutes(exitEnd);

  const errors = [];
  if (entryStartMinutes === null) errors.push('Entry Start Time is invalid');
  if (entryEndMinutes === null) errors.push('Entry End Time is invalid');
  if (exitStartMinutes === null) errors.push('Exit Start Time is invalid');
  if (exitEndMinutes === null) errors.push('Exit End Time is invalid');
  if (errors.length > 0) {
    return { errors, valid: false };
  }

  if (entryEndMinutes < entryStartMinutes) {
    errors.push('Entry End Time must be after or equal to Entry Start Time');
  }
  if (exitEndMinutes < exitStartMinutes) {
    errors.push('Exit End Time must be after or equal to Exit Start Time');
  }
  if (exitEndMinutes <= entryStartMinutes && entryEndMinutes !== entryStartMinutes) {
    errors.push('Exit range must allow a later Time OUT than the earliest Time IN');
  }

  return {
    entryStartMinutes,
    entryEndMinutes,
    exitStartMinutes,
    exitEndMinutes,
    sameDuration: exitStartMinutes - entryStartMinutes === exitEndMinutes - entryEndMinutes,
    valid: errors.length === 0,
    errors,
  };
};

const buildAttendanceForEmployee = ({ employee, dayColumns, uploadType }) => {
  if (uploadType === 'existing') {
    const attendance = dayColumns.map((day) => {
      return employee.dates[day.day - 1] || '';
    });
    return attendance;
  }

  const availableCount = dayColumns.filter((column) => !column.isSunday).length;
  const sequence = generateWorkingSequence(availableCount, employee.presentDays);
  const attendance = [];
  let sequenceIndex = 0;

  dayColumns.forEach((column) => {
    if (column.isSunday) {
      attendance.push('');
    } else {
      attendance.push(sequence[sequenceIndex] || 'A');
      sequenceIndex += 1;
    }
  });

  return attendance;
};

const buildTimingRows = ({ attendance, entryStartMinutes, entryEndMinutes, exitStartMinutes, exitEndMinutes, sameDuration }) => {
  const timeInRow = [];
  const timeOutRow = [];

  attendance.forEach((value) => {
    if (value !== 'P') {
      timeInRow.push('');
      timeOutRow.push('');
      return;
    }

    const timeIn = randomInt(entryStartMinutes, entryEndMinutes);
    if (sameDuration) {
      timeInRow.push(formatMinutesToTime(timeIn));
      timeOutRow.push(formatMinutesToTime(timeIn + (exitStartMinutes - entryStartMinutes)));
      return;
    }

    let timeOut = randomInt(exitStartMinutes, exitEndMinutes);
    let attempts = 0;
    while (timeOut <= timeIn && attempts < 5) {
      timeOut = randomInt(exitStartMinutes, exitEndMinutes);
      attempts += 1;
    }

    if (timeOut <= timeIn) {
      timeOut = Math.min(exitEndMinutes, timeIn + 1);
    }

    timeInRow.push(formatMinutesToTime(timeIn));
    timeOutRow.push(formatMinutesToTime(timeOut));
  });

  return { timeInRow, timeOutRow };
};

const generateAttendanceWorkbook = (file, settings) => {
  if (!file) {
    throw createValidationError('Excel file is required.');
  }

  const month = validateInteger(settings.month);
  const year = validateInteger(settings.year);
  if (!month || !year) {
    throw createValidationError('Valid month and year are required.');
  }

  const timingValidation = validateTimingSettings(settings);
  if (!timingValidation.valid) {
    const errorMessage = timingValidation.errors.join('. ');
    throw new Error(errorMessage);
  }

  const daysInMonth = getMonthDays(month, year);
  const parseResult = parseExcelRows(file.buffer, daysInMonth);
  if (parseResult.errors.length) {
    throw new Error(parseResult.errors[0]);
  }

  const uploadType = settings.uploadType === 'existing' ? 'existing' : 'basic';
  if (uploadType === 'basic' && parseResult.dateColumns.length > 0) {
    throw createValidationError('Selected Basic Sheet but file contains date columns. Use Existing Muster Roll or remove the date columns.');
  }
  if (uploadType === 'existing') {
    if (parseResult.dateColumns.length === 0) {
      throw createValidationError('Selected Existing Muster Roll but no date columns were detected. The file must include date columns for the selected month.');
    }
    if (parseResult.dateColumns.length !== daysInMonth) {
      throw createValidationError(`Existing muster roll must include date columns for all days of the selected month (${daysInMonth} days).`);
    }
  }

  const dayColumns = buildDayColumns(month, year);
  const workbookData = [];

  parseResult.employees.forEach((employee) => {
    if (!employee.id || !employee.name || employee.presentDays === null) {
      return;
    }

    if (uploadType === 'basic') {
      const availableWorkdays = dayColumns.filter((column) => !column.isSunday).length;
      if (employee.presentDays > availableWorkdays) {
        throw createValidationError(`Present Days for ${employee.name} (${employee.id}) cannot exceed ${availableWorkdays} available workdays.`);
      }
    }

    const attendance = buildAttendanceForEmployee({ employee, dayColumns, uploadType });

    if (uploadType === 'existing') {
      const actualPresent = attendance.filter((value) => value === 'P').length;
      if (actualPresent !== employee.presentDays) {
        throw createValidationError(`Present days mismatch for ${employee.name} (${employee.id}). Expected ${employee.presentDays}, actual ${actualPresent}. Please correct the file before generating attendance.`);
      }
    }

    const { timeInRow, timeOutRow } = buildTimingRows({
      attendance,
      entryStartMinutes: timingValidation.entryStartMinutes,
      entryEndMinutes: timingValidation.entryEndMinutes,
      exitStartMinutes: timingValidation.exitStartMinutes,
      exitEndMinutes: timingValidation.exitEndMinutes,
      sameDuration: timingValidation.sameDuration,
    });

    workbookData.push([
      employee.id,
      employee.name,
      'Attend',
      ...attendance,
    ]);
    workbookData.push([
      '',
      '',
      'Time IN',
      ...timeInRow,
    ]);
    workbookData.push([
      '',
      '',
      'Time OUT',
      ...timeOutRow,
    ]);
  });

  const headers = ['ID', 'Name', 'Attendance Type', ...dayColumns.map((column) => `${column.day}`)];
  const worksheetData = [headers, ...workbookData];
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);

  worksheet['!merges'] = [];
  let rowIndex = 1;
  parseResult.employees.forEach(() => {
    worksheet['!merges'].push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex + 2, c: 0 } });
    worksheet['!merges'].push({ s: { r: rowIndex, c: 1 }, e: { r: rowIndex + 2, c: 1 } });
    rowIndex += 3;
  });

  const columnCount = headers.length;
  const rowCount = worksheetData.length;
  applyWorksheetStyles(worksheet, rowCount, columnCount);
  setColumnWidths(worksheet, columnCount);

  xlsx.utils.book_append_sheet(workbook, worksheet, 'Attendance Sheet');
  const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer', cellStyles: true });

  return { buffer, fileName: `attendance-${String(month).padStart(2, '0')}-${year}.xlsx` };
};

module.exports = {
  validateFileSettings,
  generateAttendanceWorkbook,
};

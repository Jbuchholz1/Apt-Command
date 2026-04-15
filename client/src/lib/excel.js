import ExcelJS from 'exceljs';

/**
 * Parse an Excel file (ArrayBuffer) into an array of row objects.
 * First row is treated as headers, subsequent rows become objects.
 * Drop-in replacement for: XLSX.read() + XLSX.utils.sheet_to_json()
 */
export async function readExcelToJson(arrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) return [];

  // Row 1 = headers
  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = cell.value != null ? String(cell.value).trim() : '';
  });

  // Rows 2+ = data
  const jsonData = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const obj = {};
    let hasValue = false;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;

      let value = cell.value;
      // ExcelJS can return rich text objects — unwrap them
      if (value && typeof value === 'object' && value.richText) {
        value = value.richText.map(rt => rt.text).join('');
      }
      // Convert dates to strings for consistency
      if (value instanceof Date) {
        value = value.toISOString();
      }
      obj[header] = value;
      hasValue = true;
    });

    if (hasValue) jsonData.push(obj);
  }

  return jsonData;
}

/**
 * Write an array of row objects to an Excel file and trigger browser download.
 * Drop-in replacement for: XLSX.utils.json_to_sheet() + XLSX.writeFile()
 */
export async function writeExcelFile(data, sheetName, fileName) {
  if (!data || data.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Use keys from first object as column headers
  const keys = Object.keys(data[0]);
  worksheet.columns = keys.map(key => ({ header: key, key }));

  // Add data rows
  for (const row of data) {
    worksheet.addRow(row);
  }

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

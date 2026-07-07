function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  const escaped = text.replace(/"/g, '""');

  if (
    escaped.includes(',') ||
    escaped.includes('"') ||
    escaped.includes('\n') ||
    escaped.includes('\r') ||
    escaped.includes(';')
  ) {
    return `"${escaped}"`;
  }

  return escaped;
}

export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
): void {
  if (!rows.length) {
    return;
  }

  const headers = Object.keys(rows[0]);

  const csvLines = [
    headers.map(escapeCsvValue).join(';'),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(';'),
    ),
  ];

  const csvContent = `\uFEFF${csvLines.join('\n')}`;

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

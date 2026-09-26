function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

export function fmtTimestamp(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function fmtTimestampFile(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}_${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

export function fmtDatePart(d) {
  return fmtTimestamp(d).slice(0, 10);
}

export function fmtTimePart(d) {
  return fmtTimestamp(d).slice(11, 16);
}

export function combineDateTime(datePart, timePart) {
  if (!datePart || !timePart) return null;
  const d = new Date(`${datePart}T${timePart}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
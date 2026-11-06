function fechaIsoSegura(year, month, day) {
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (
    !Number.isInteger(yearNumber)
    || yearNumber < 1
    || yearNumber > 9999
    || !Number.isInteger(monthNumber)
    || !Number.isInteger(dayNumber)
  ) {
    return "";
  }

  const iso = `${String(yearNumber).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}

export function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fechaIsoSegura(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const serialDay = Math.floor(value);
    if (serialDay > 2958465) return "";
    const date = new Date(Date.UTC(1899, 11, 30) + serialDay * 86400000);
    return fechaIsoSegura(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }

  const text = String(value ?? "").replace(/\s+/g, " ").trim().replace(/[.]/g, "/");
  if (!text || /^(SIN\s+INFORMACION|NO\s+APLICA|N\s*\/\s*A|N\/A)$/i.test(text)) {
    return "";
  }

  let match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    return fechaIsoSegura(match[1], match[2], match[3]);
  }

  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return "";

  let [, first, second, year] = match;
  if (year.length === 2) {
    year = Number(year) >= 50 ? `19${year}` : `20${year}`;
  }

  let day;
  let month;
  if (Number(first) > 12) {
    day = first;
    month = second;
  } else if (Number(second) > 12) {
    month = first;
    day = second;
  } else {
    day = first;
    month = second;
  }

  return fechaIsoSegura(year, month, day);
}

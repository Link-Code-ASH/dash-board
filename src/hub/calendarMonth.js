export function isValidMonth(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month || "") && !month.startsWith("0000");
}

export function shiftMonth(month, offset) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthCells(month) {
  const first = new Date(`${month}-01T12:00:00`);
  const end = new Date(first);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0);
  const leading = (first.getDay() + 6) % 7;
  const days = end.getDate();
  return Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    return day > 0 && day <= days ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}

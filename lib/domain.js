export const WORK_TYPES = ["Digging", "Leveling", "Road work", "Demolition", "Loading", "Foundation", "Other"];
export const money = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const hoursBetween = (log) => Math.max(0, ((log.end_at ? new Date(log.end_at) : new Date()) - new Date(log.start_at)) / 3600000);
export const totalHours = (logs = []) => logs.reduce((sum, log) => sum + hoursBetween(log), 0);
export function estimateBooking(machine, form) {
  if (!machine) return 0;
  if (form.type === "monthly") return (form.with_diesel ? machine.monthly_diesel : machine.monthly_no_diesel) * Number(form.months || 1);
  if (form.type === "daily") return Number(machine.daily_rate || machine.hourly_rate * 8) * Number(form.duration_days || 1);
  return Number(machine.hourly_rate || 0) * Number(form.duration_hours || 1);
}
export function calculateBill(booking, machine, logs = [], gstRate = 0.18) {
  const hours = totalHours(logs);
  const base = booking.type === "monthly"
    ? Number(booking.quoted_rate || (booking.with_diesel ? machine?.monthly_diesel : machine?.monthly_no_diesel) || 0) * Number(booking.months || 1)
    : booking.type === "daily"
      ? Number(booking.quoted_rate || machine?.daily_rate || 0) * Number(booking.duration_days || 1)
      : Math.round(hours * Number(booking.quoted_rate || machine?.hourly_rate || 0));
  const tax = Math.round(base * gstRate);
  return { hours, base, tax, total: base + tax };
}
export const upiPaymentLink = (upi, amount, note) =>
  `upi://pay?pa=${encodeURIComponent(upi)}&pn=JCB%20Rental&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

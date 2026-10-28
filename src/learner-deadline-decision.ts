export type DeadlineStatus = "overdue" | "due-today" | "upcoming";

function dayNumber(value: string): number {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Dates must use YYYY-MM-DD.");
  return Math.floor(date.getTime() / 86_400_000);
}

export function deadlineStatus(dueDate: string, referenceDate: string): DeadlineStatus {
  const difference = dayNumber(dueDate) - dayNumber(referenceDate);
  if (difference < 0) return "overdue";
  if (difference === 0) return "due-today";
  return "upcoming";
}

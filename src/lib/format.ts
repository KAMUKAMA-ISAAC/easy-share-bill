export function formatMoney(amount: number, currency = "UGX") {
  const code = (currency || "UGX").toUpperCase();
  // UGX has no minor units in practice; render as whole shillings.
  const isUGX = code === "UGX";
  try {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: code,
      minimumFractionDigits: isUGX ? 0 : 2,
      maximumFractionDigits: isUGX ? 0 : 2,
    }).format(amount);
  } catch {
    const rounded = isUGX ? Math.round(amount) : amount.toFixed(2);
    return `${code} ${rounded}`;
  }
}

export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function randomToken(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, len);
}

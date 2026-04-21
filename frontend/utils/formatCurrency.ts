export function formatCurrency(amount: number | string, _compact = false) {
  const value = Number(amount || 0);

  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
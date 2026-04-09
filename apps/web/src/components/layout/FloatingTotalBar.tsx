interface FloatingTotalBarItem {
  label: string;
  amount: number;
  currency: string;
}

interface FloatingTotalBarProps {
  items: FloatingTotalBarItem[];
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function FloatingTotalBar({ items }: FloatingTotalBarProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex h-[60px] items-center justify-center gap-8 bg-gradient-to-r from-real-estate to-[#D45A56] px-6 shadow-lg"
      data-testid="floating-total-bar"
      role="status"
      aria-label="Totals"
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-white">
          <span className="text-sm font-medium opacity-90">{item.label}:</span>
          <span className="text-base font-bold">{formatAmount(item.amount, item.currency)}</span>
        </div>
      ))}
    </div>
  );
}

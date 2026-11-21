import { NavIcon } from "./AppShell";

const tones = {
  violet: "bg-[#F5F1FF] text-[#5D45C2]",
  blue: "bg-[#EAF4FF] text-[#2661A6]",
  amber: "bg-[#FFF4E4] text-[#965A22]",
  green: "bg-[#E7F7EF] text-[#217255]",
};

export function SalesMetric({ label, value, hint, icon, tone }: {
  label: string; value: React.ReactNode; hint: string; icon: string; tone: keyof typeof tones;
}) {
  return (
    <div className={`nova-metric nova-metric-${tone} min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><NavIcon name={icon} /></span>
        <p className="text-xs font-semibold text-muted">{label}</p>
      </div>
      <div className="mt-3 break-words text-[23px] font-semibold leading-tight text-ink tabular-nums">{value}</div>
      <p className="mt-1.5 text-[11px] text-muted">{hint}</p>
    </div>
  );
}

export function formatSalesAmount(total: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(total)}`;
}

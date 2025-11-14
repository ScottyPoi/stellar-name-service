type StatusTone = "success" | "warning" | "error";

const toneStyles: Record<StatusTone, string> = {
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 shadow-emerald-500/20",
  warning:
    "border-amber-400/30 bg-amber-400/10 text-amber-50 shadow-amber-400/20",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-100 shadow-rose-500/20",
};

const toneIcon: Record<StatusTone, string> = {
  success: "✅",
  warning: "⏳",
  error: "⚠️",
};

interface StatusBannerProps {
  tone: StatusTone;
  title: string;
  message?: string;
}

export function StatusBanner({ tone, title, message }: StatusBannerProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${toneStyles[tone]}`}
    >
      <span className="text-base" aria-hidden>
        {toneIcon[tone]}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        {message ? <p className="text-xs opacity-90">{message}</p> : null}
      </div>
    </div>
  );
}

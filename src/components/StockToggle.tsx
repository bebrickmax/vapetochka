"use client";

interface StockToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function StockToggle({ checked, onChange }: StockToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-3 rounded-full py-1 pl-1 text-sm font-semibold text-ink/85"
    >
      <span>Только в наличии</span>
      <span
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 ${
          checked ? "bg-paper" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute left-0.5 size-6 rounded-full shadow-md transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] ${
            checked ? "translate-x-5 bg-on-paper" : "translate-x-0 bg-paper"
          }`}
        />
      </span>
    </button>
  );
}

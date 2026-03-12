interface Props {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  required?: boolean;
}

export default function CheckboxGroup({ label, options, selected, onChange, required }: Props) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };

  return (
    <div>
      <label className="block text-[16px] font-medium mb-2">
        {label}
        {required && <span className="text-gold-500 ml-1">*</span>}
      </label>
      <div className="grid gap-2">
        {options.map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-3 px-4 py-3 border cursor-pointer transition-colors text-[16px] ${
              selected.includes(opt)
                ? 'border-gold-500/50 bg-gold-500/5 text-text-primary'
                : 'border-border bg-bg text-text-muted hover:border-border-hover'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="hidden"
            />
            <div
              className={`w-3.5 h-3.5 border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                selected.includes(opt) ? 'border-gold-500 bg-gold-500' : 'border-text-muted'
              }`}
            >
              {selected.includes(opt) && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#09090b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

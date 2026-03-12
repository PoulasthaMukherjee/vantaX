interface Option {
  value: string;
  description?: string;
}

interface Props {
  label: string;
  options: (string | Option)[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export default function RadioGroup({ label, options, value, onChange, required }: Props) {
  return (
    <div>
      <label className="block text-[16px] font-medium mb-2">
        {label}
        {required && <span className="text-gold-500 ml-1">*</span>}
      </label>
      <div className="grid gap-2">
        {options.map((opt) => {
          const optValue = typeof opt === 'string' ? opt : opt.value;
          const optDesc = typeof opt === 'string' ? undefined : opt.description;
          const selected = value === optValue;

          return (
            <label
              key={optValue}
              className={`flex items-start gap-3 px-4 py-3 border cursor-pointer transition-colors text-[16px] ${
                selected
                  ? 'border-gold-500/50 bg-gold-500/5 text-text-primary'
                  : 'border-border bg-bg text-text-muted hover:border-border-hover'
              }`}
            >
              <input
                type="radio"
                checked={selected}
                onChange={() => onChange(optValue)}
                className="hidden"
              />
              <div
                className={`w-3.5 h-3.5 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                  selected ? 'border-gold-500' : 'border-text-muted'
                }`}
              >
                {selected && <div className="w-1.5 h-1.5 bg-gold-500" />}
              </div>
              <div>
                <span className="font-medium">{optValue}</span>
                {optDesc && <p className="text-text-muted text-[16px] mt-0.5">{optDesc}</p>}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

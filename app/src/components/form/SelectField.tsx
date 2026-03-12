import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';

interface Option {
  label: string;
  value: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: Option[];
  required?: boolean;
  error?: string;
}

export default function SelectField({ label, options, required, error, className = '', ...rest }: Props) {
  const baseClass =
    'w-full appearance-none bg-bg border border-border px-4 py-3 pr-12 text-[16px] text-text-primary outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5';

  return (
    <div>
      <label className="block text-[16px] font-medium mb-1.5">
        {label}
        {required && <span className="text-gold-500 ml-1">*</span>}
      </label>
      <div className="relative">
        <select
          {...rest}
          className={`${baseClass} ${className}`}
          style={{ colorScheme: 'dark' }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
      </div>
      {error && <p className="text-pink text-[16px] mt-1">{error}</p>}
    </div>
  );
}

import SectionHeader from '../../components/ui/SectionHeader';
import { RUBRIC_DATA } from '../../lib/constants';

export default function EvalFramework() {
  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <SectionHeader
        label="Evaluation"
        title="How we score your candidates."
        lead="All submissions go through multi-stage scoring: AI pre-score, integrity checks, and human moderation on a standardized rubric. You review top finalists."
      />

      <div className="overflow-x-auto border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-purple-500/5">
              <th className="px-5 py-3 text-left text-[16px] font-bold uppercase tracking-wider text-text-muted">Criteria</th>
              <th className="px-5 py-3 text-left text-[16px] font-bold uppercase tracking-wider text-gold-500">Weight</th>
              <th className="px-5 py-3 text-left text-[16px] font-bold uppercase tracking-wider text-text-muted">What It Measures</th>
            </tr>
          </thead>
          <tbody>
            {RUBRIC_DATA.map((r) => (
              <tr key={r.label} className="border-t border-border hover:bg-card-hover transition-colors">
                <td className="px-5 py-3 text-[16px] text-text-primary font-medium">{r.label}</td>
                <td className="px-5 py-3 text-[16px] text-gold-500 font-bold">{r.weight}%</td>
                <td className="px-5 py-3 text-[16px] text-text-secondary">{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

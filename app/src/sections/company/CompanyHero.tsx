import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function CompanyHero() {
  return (
    <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
      <div className="absolute top-[20%] right-[-20%] w-[60%] h-[60%] bg-[radial-gradient(ellipse,rgba(255,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 1, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-3xl"
      >
        <p className="text-[16px] font-bold uppercase tracking-wider text-purple-400 mb-6">
          <span className="text-text-muted">{'// '}</span>For Companies
        </p>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.1] mb-6">
          Your <span className="text-gold-500">problem.</span>
          <br />
          Their execution.
        </h1>

        <motion.p
          initial={{ opacity: 1, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="text-[16px] text-text-muted max-w-2xl mx-auto leading-relaxed"
        >
          Share one real company problem. VantaX creates the AI-assisted audition and you only meet
          <span className="text-gold-500"> top finalists</span>.
        </motion.p>

        <motion.div
          initial={{ opacity: 1, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-wrap gap-3 justify-center"
        >
          <Link
            to="/companies/start"
            className="px-6 py-3 font-bold text-[16px] uppercase tracking-wider transition-all bg-gold-500 text-bg hover:bg-gold-400 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] animate-glow-pulse inline-block"
          >
            Run a Hiring Audition
          </Link>
          <a
            href="#how-it-works"
            className="px-6 py-3 font-bold text-[16px] uppercase tracking-wider transition-all border border-purple-500/30 text-purple-400 hover:border-purple-500 hover:bg-purple-500/10 inline-block"
          >
            Learn How It Works
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 1, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-[16px] uppercase tracking-[0.12em] text-text-muted"
        >
          Share context - review the AI draft - meet only top candidates
        </motion.p>
      </motion.div>
    </section>
  );
}

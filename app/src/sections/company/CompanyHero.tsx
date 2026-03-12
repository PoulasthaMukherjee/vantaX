import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../../components/ui/Button';

export default function CompanyHero() {
  return (
    <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
      <div className="absolute top-[20%] right-[-20%] w-[60%] h-[60%] bg-[radial-gradient(ellipse,rgba(255,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-3xl"
      >
        <p className="text-[16px] font-bold uppercase tracking-wider text-purple-400 mb-6">
          <span className="text-text-muted">{'// '}</span>For Companies
        </p>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6">
          Hire engineers by seeing them solve your <span className="text-gold-500">problem</span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-[16px] text-text-muted max-w-2xl mx-auto leading-relaxed"
        >
          Share one real problem from your company. VantaX converts it into a 3-round hiring
          audition and screens candidates for you. You only review the{' '}
          <span className="text-gold-500">top finalists</span>.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-wrap gap-3 justify-center"
        >
          <Link to="/companies/start">
            <Button className="animate-glow-pulse">Run a Hiring Audition</Button>
          </Link>
          <a href="#how-it-works">
            <Button variant="outline">Learn How It Works</Button>
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-[12px] uppercase tracking-[0.12em] text-text-muted"
        >
          One company problem - three audition rounds - top candidates for interview
        </motion.p>
      </motion.div>
    </section>
  );
}

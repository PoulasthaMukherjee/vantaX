import { motion } from 'framer-motion';
import Button from '../../components/ui/Button';

export default function JuryHero() {
  return (
    <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
      <div className="absolute top-[20%] left-[-15%] w-[50%] h-[50%] bg-[radial-gradient(ellipse,rgba(255,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-3xl"
      >
        <p className="text-[16px] font-bold uppercase tracking-wider text-purple-400 mb-6">
          <span className="text-text-muted">{'// '}</span>Jury Invitation
        </p>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6 max-w-4xl">
          You know <span className="text-gold-500">resumes lie.</span>
          <br />
          Help us find the real ones.
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-[16px] text-text-muted max-w-2xl mx-auto leading-relaxed"
        >
          We need evaluators who understand what good execution looks like in the real world.
          Review top submissions and help identify who gets shortlisted.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-wrap gap-3 justify-center"
        >
          <a href="#jury-signup">
            <Button className="animate-glow-pulse">Express Interest</Button>
          </a>
          <a href="#your-role">
            <Button variant="outline">Learn About the Role</Button>
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}

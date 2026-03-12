import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Hero() {
  return (
    <section className="min-h-screen flex flex-col justify-center px-4 relative overflow-hidden">
      {/* Background image — real <img> for LCP + image search */}
      <picture className="absolute inset-0">
        <source srcSet="/hero-image.avif" type="image/avif" />
        <source srcSet="/hero-image.webp" type="image/webp" />
        <img
          src="/hero-image.webp"
          alt="VantaX 2026 structured hiring audition"
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </picture>
      {/* Dark overlay to keep text readable */}
      <div className="absolute inset-0 bg-bg/80" />
      {/* Subtle background glow */}
      <div className="absolute top-[20%] left-[-20%] w-[60%] h-[60%] bg-[radial-gradient(ellipse,rgba(255,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-[1000px] mx-auto w-full relative z-10">
        <motion.div
          initial={{ opacity: 1, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-text-muted text-[16px] mb-6">
            <span className="text-purple-500">{'// '}</span>
            India's first structured hiring audition
          </p>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-8 tracking-tight">
            <span className="text-purple-500">3</span> challenges.
            <br />
            <span className="text-gold-500">2</span> hours each.
            <br />
            <span className="text-text-primary">Prove it.</span>
          </h1>

          <motion.p
            initial={{ opacity: 1, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="text-[16px] text-text-muted max-w-xl leading-relaxed mb-10"
          >
            Real companies post <span className="text-purple-400">real problems</span>.
            You solve them under constraint.
            AI tools <span className="text-purple-400">encouraged</span>.
            Your execution matters more than your resume.
          </motion.p>

          <motion.div
            initial={{ opacity: 1, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 flex-wrap mb-6"
          >
            <span className="text-purple-500 text-[16px]">$</span>
            <a
              href="#register"
              className="px-8 py-3.5 bg-gold-500 text-bg font-bold text-[16px] uppercase tracking-wider hover:bg-gold-400 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] transition-all inline-block"
            >
              vantax --register
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 1, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-6 text-[16px] text-text-muted"
          >
            <Link to="/companies" className="hover:text-gold-500 transition-colors">Company? Run a Hiring Audition - we do the work &rarr;</Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

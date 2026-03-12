import { motion } from 'framer-motion';

export default function CTA() {
  return (
    <section className="py-24 px-4 text-center relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-[1000px] mx-auto"
      >
        <div className="border border-border/50 border-dashed py-16 px-8">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Your college brand won't matter here.
            <br />
            <span className="text-gold-500">Your execution will.</span>
          </h2>
          <p className="text-text-muted text-[16px] mb-2">
            <span className="text-purple-500">{'// '}</span>
            final-year · recent grads · 0-2 yrs exp
          </p>
          <p className="text-gold-500 text-[16px] font-bold mb-8">
            ₹199 + GST · All 3 Challenges
          </p>
          <a
            href="#register"
            className="px-8 py-3.5 bg-gold-500 text-bg font-bold text-[16px] uppercase tracking-wider hover:bg-gold-400 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] transition-all inline-block"
          >
            vantax --register --now
          </a>
        </div>
      </motion.div>
    </section>
  );
}

/**
 * Animated mock dashboard for the landing page hero section.
 *
 * Each element fades / slides in with staggered timing so the dashboard
 * feels alive on first load — progress bar fills, checklist items pop in
 * one by one, floating badges drift in from the sides.
 */
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

export function HeroDashboard() {
  return (
    <div className="relative mx-auto w-full max-w-[500px]">
      {/* Ambient glow blurs */}
      <div className="absolute -left-8 top-12 hidden h-24 w-24 rounded-full bg-[hsl(166_58_62%/0.18)] blur-2xl sm:block" />
      <div className="absolute -right-8 bottom-14 hidden h-20 w-20 rounded-full bg-[hsl(45_85_58%/0.18)] blur-2xl sm:block" />

      {/* Main card — fades + slides in */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease }}
        className="relative overflow-hidden rounded-[28px] border border-[hsl(43_30%_94%/0.12)] bg-[hsl(200_40%_16%)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-2.5 place-items-center rounded-full bg-[hsl(166_58_62%)] animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-[hsl(43_30%_94%/0.6)]">
              live dashboard
            </span>
          </div>
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="rounded-full border border-[hsl(166_58_62%/0.4)] bg-[hsl(166_58_62%/0.12)] px-2 py-1 text-[10px] font-medium text-[hsl(166_58_68%)]"
          >
            In progress
          </motion.span>
        </motion.div>

        {/* Study card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="rounded-2xl border border-[hsl(43_30%_94%/0.08)] bg-[hsl(200_34%_13%)] p-4"
        >
          <p className="font-serif text-lg font-semibold text-[hsl(43_30%_94%)]">
            Patient/Family Care Study
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[hsl(43_30%_94%/0.5)]">
            Pulmonary Tuberculosis
          </p>

          {/* Progress bar */}
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[hsl(43_30%_94%/0.08)]">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "72%" }}
              transition={{ delay: 1.0, duration: 1.8, ease }}
              className="h-full rounded-full bg-gradient-to-r from-[hsl(166_58_62%)] to-[hsl(166_58_55%)]"
            />
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.4 }}
            className="mt-2 text-right text-[10px] text-[hsl(43_30%_94%/0.5)]"
          >
            72% complete
          </motion.p>

          {/* Section items — stagger in one by one */}
          <div className="mt-4 space-y-3">
            {["Patient details", "Nursing care plan", "Viva prep"].map(
              (item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 0.8 + index * 0.2,
                    duration: 0.5,
                    ease,
                  }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(43_30%_94%/0.08)] bg-[hsl(200_40%_17%)] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        delay: 1.0 + index * 0.2,
                        duration: 0.3,
                        type: "spring",
                        stiffness: 300,
                      }}
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-[9px] font-semibold",
                        index === 0 &&
                          "bg-[hsl(166_58_62%)] text-[hsl(200_40%_12%)]",
                        index === 1 &&
                          "bg-[hsl(45_85_58%/0.18)] text-[hsl(45_85_68%)]",
                        index === 2 &&
                          "bg-[hsl(43_30%_94%/0.08)] text-[hsl(43_30%_94%)]",
                      )}
                    >
                      {index + 1}
                    </motion.span>
                    <span className="text-sm text-[hsl(43_30%_94%/0.8)]">
                      {item}
                    </span>
                  </div>
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      delay: 1.2 + index * 0.2,
                      duration: 0.4,
                      type: "spring",
                      stiffness: 250,
                    }}
                  >
                    <CheckCircle2 className="size-4 text-[hsl(166_58_62%)]" />
                  </motion.div>
                </motion.div>
              ),
            )}
          </div>
        </motion.div>

        {/* Next step bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 0.5 }}
          className="mt-4 flex items-center justify-between rounded-2xl border border-[hsl(166_58_62%/0.25)] bg-[hsl(166_58_62%/0.08)] px-4 py-3"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[hsl(43_30%_94%/0.55)]">
              next step
            </p>
            <p className="mt-1 text-sm font-medium text-[hsl(43_30%_94%)]">
              Prepare for defense
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-full bg-[hsl(166_58_62%)] px-3 py-2 text-[11px] font-semibold text-[hsl(200_40%_12%)]"
          >
            Review
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Floating badges — drift in with delay */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.8, duration: 0.6 }}
        className="absolute -right-3 top-10 rounded-full border border-[hsl(43_30%_94%/0.12)] bg-[hsl(200_40%_16%)] px-3 py-2 shadow-lg"
      >
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[hsl(43_30%_94%/0.7)]">
          <span className="grid size-2 rounded-full bg-[hsl(45_85_58%)] animate-pulse" />
          24h review
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 2.0, duration: 0.6 }}
        className="absolute -left-3 bottom-8 rounded-full border border-[hsl(43_30%_94%/0.12)] bg-[hsl(200_40%_16%)] px-3 py-2 shadow-lg"
      >
        <div className="text-[10px] uppercase tracking-[0.18em] text-[hsl(43_30%_94%/0.7)]">
          98% clarity score
        </div>
      </motion.div>
    </div>
  );
}

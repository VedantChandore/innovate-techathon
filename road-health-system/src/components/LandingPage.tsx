"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
} from "framer-motion";
import {
  Shield,
  Activity,
  Database,
  MapPin,
  BarChart3,
  Truck,
  ArrowRight,
  ChevronDown,
  Layers,
  Gauge,
  Eye,
  Clock,
  CheckCircle2,
  Zap,
  Globe,
} from "lucide-react";

interface LandingPageProps {
  onOpenRegistry: () => void;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SVG MASCOTS & ILLUSTRATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TrafficConeMascot({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 80 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Cone body */}
      <path d="M40 8L62 88H18L40 8Z" fill="#f97316" stroke="#ea580c" strokeWidth="2" />
      {/* White stripes */}
      <rect x="27" y="38" width="26" height="6" rx="1" fill="white" opacity="0.9" />
      <rect x="23" y="58" width="34" height="6" rx="1" fill="white" opacity="0.9" />
      {/* Base */}
      <rect x="12" y="86" width="56" height="14" rx="4" fill="#374151" />
      <rect x="12" y="86" width="56" height="4" rx="2" fill="#4b5563" />
      {/* Eyes */}
      <ellipse cx="33" cy="48" rx="5" ry="5.5" fill="white" />
      <ellipse cx="47" cy="48" rx="5" ry="5.5" fill="white" />
      <circle cx="34.5" cy="48" r="3" fill="#1f2937" />
      <circle cx="48.5" cy="48" r="3" fill="#1f2937" />
      {/* Eye sparkle */}
      <circle cx="36" cy="46.5" r="1.2" fill="white" />
      <circle cx="50" cy="46.5" r="1.2" fill="white" />
      {/* Cute blush */}
      <ellipse cx="28" cy="55" rx="4" ry="2.5" fill="#fb923c" opacity="0.4" />
      <ellipse cx="52" cy="55" rx="4" ry="2.5" fill="#fb923c" opacity="0.4" />
      {/* Smile */}
      <path d="M34 54Q40 60 46 54" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HardHatWorkerMascot({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 120 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body / vest */}
      <rect x="35" y="80" width="50" height="50" rx="12" fill="#f97316" />
      {/* Vest reflective stripes */}
      <rect x="38" y="95" width="44" height="4" rx="2" fill="#fbbf24" opacity="0.8" />
      <rect x="38" y="105" width="44" height="4" rx="2" fill="#fbbf24" opacity="0.8" />
      {/* Arms */}
      <rect x="18" y="85" width="20" height="12" rx="6" fill="#f97316" />
      <rect x="82" y="85" width="20" height="12" rx="6" fill="#f97316" />
      {/* Head */}
      <circle cx="60" cy="58" r="22" fill="#fde68a" />
      {/* Hard hat */}
      <path d="M34 52C34 35 46 22 60 22C74 22 86 35 86 52H34Z" fill="#f97316" />
      <rect x="30" y="50" width="60" height="8" rx="4" fill="#ea580c" />
      <rect x="55" y="22" width="10" height="8" rx="3" fill="#ea580c" />
      {/* Eyes */}
      <ellipse cx="50" cy="58" rx="4" ry="4.5" fill="white" />
      <ellipse cx="70" cy="58" rx="4" ry="4.5" fill="white" />
      <circle cx="51" cy="58" r="2.5" fill="#1f2937" />
      <circle cx="71" cy="58" r="2.5" fill="#1f2937" />
      {/* Eye sparkle */}
      <circle cx="52.5" cy="56.5" r="1" fill="white" />
      <circle cx="72.5" cy="56.5" r="1" fill="white" />
      {/* Smile */}
      <path d="M50 67Q60 76 70 67" fill="none" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
      {/* Clipboard in right hand */}
      <rect x="90" y="82" width="16" height="22" rx="2" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1" />
      <rect x="93" y="87" width="10" height="2" rx="1" fill="#9ca3af" />
      <rect x="93" y="92" width="10" height="2" rx="1" fill="#9ca3af" />
      <rect x="93" y="97" width="7" height="2" rx="1" fill="#9ca3af" />
      <rect x="95" y="82" width="6" height="3" rx="1" fill="#6b7280" />
    </svg>
  );
}

function RoadBarrierSVG({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 140 55" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main bar */}
      <rect x="8" y="12" width="124" height="22" rx="4" fill="#f97316" />
      {/* Diagonal stripes */}
      <clipPath id="bc">
        <rect x="8" y="12" width="124" height="22" rx="4" />
      </clipPath>
      <g clipPath="url(#bc)">
        <rect x="20" y="8" width="12" height="30" fill="#1f2937" transform="skewX(-20)" />
        <rect x="48" y="8" width="12" height="30" fill="#1f2937" transform="skewX(-20)" />
        <rect x="76" y="8" width="12" height="30" fill="#1f2937" transform="skewX(-20)" />
        <rect x="104" y="8" width="12" height="30" fill="#1f2937" transform="skewX(-20)" />
      </g>
      {/* Legs */}
      <rect x="22" y="34" width="6" height="16" rx="1" fill="#6b7280" />
      <rect x="112" y="34" width="6" height="16" rx="1" fill="#6b7280" />
      {/* Feet */}
      <rect x="16" y="47" width="18" height="5" rx="2" fill="#4b5563" />
      <rect x="106" y="47" width="18" height="5" rx="2" fill="#4b5563" />
      {/* Reflectors */}
      <circle cx="14" cy="23" r="3" fill="#fbbf24" opacity="0.8" />
      <circle cx="126" cy="23" r="3" fill="#fbbf24" opacity="0.8" />
    </svg>
  );
}

function RoadRollerSVG({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 160 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Front roller */}
      <rect x="8" y="52" width="50" height="28" rx="14" fill="#6b7280" stroke="#4b5563" strokeWidth="2" />
      <rect x="14" y="58" width="38" height="16" rx="8" fill="#9ca3af" />
      {/* Roller lines */}
      <line x1="22" y1="56" x2="22" y2="76" stroke="#4b5563" strokeWidth="1.5" />
      <line x1="33" y1="56" x2="33" y2="76" stroke="#4b5563" strokeWidth="1.5" />
      <line x1="44" y1="56" x2="44" y2="76" stroke="#4b5563" strokeWidth="1.5" />
      {/* Cab body */}
      <rect x="52" y="20" width="60" height="40" rx="6" fill="#f97316" />
      <rect x="52" y="20" width="60" height="6" rx="3" fill="#ea580c" />
      {/* Cab window */}
      <rect x="60" y="30" width="24" height="18" rx="3" fill="#93c5fd" opacity="0.7" />
      <rect x="60" y="30" width="24" height="4" rx="2" fill="#60a5fa" opacity="0.5" />
      {/* Exhaust */}
      <rect x="96" y="10" width="6" height="14" rx="3" fill="#4b5563" />
      <circle cx="99" cy="8" r="4" fill="#9ca3af" opacity="0.5" />
      <circle cx="99" cy="3" r="3" fill="#9ca3af" opacity="0.3" />
      {/* Rear wheel */}
      <circle cx="128" cy="68" r="18" fill="#374151" stroke="#1f2937" strokeWidth="2" />
      <circle cx="128" cy="68" r="10" fill="#4b5563" />
      <circle cx="128" cy="68" r="4" fill="#6b7280" />
      {/* Connection */}
      <rect x="48" y="58" width="16" height="6" rx="2" fill="#ea580c" />
      {/* Warning light */}
      <circle cx="64" cy="17" r="4" fill="#fbbf24" />
      <circle cx="64" cy="17" r="2" fill="#fef3c7" />
    </svg>
  );
}

function RoadSignSVG({ text = "NH", style = {} }: { text?: string; style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 50 65" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Post */}
      <rect x="22" y="35" width="6" height="28" rx="1" fill="#6b7280" />
      {/* Sign board - diamond shape */}
      <path d="M25 2L46 23L25 44L4 23L25 2Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="2" />
      <path d="M25 7L41 23L25 39L9 23L25 7Z" fill="#fef3c7" />
      {/* Text */}
      <text x="25" y="26" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#92400e">{text}</text>
    </svg>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ANIMATION WRAPPERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Continuous float / bob animation */
function FloatingElement({
  children,
  delay = 0,
  duration = 4,
  yRange = 12,
  rotateRange = 3,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  yRange?: number;
  rotateRange?: number;
}) {
  return (
    <motion.div
      animate={{
        y: [-yRange, yRange, -yRange],
        rotate: [-rotateRange, rotateRange, -rotateRange],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {children}
    </motion.div>
  );
}

/** Scroll-triggered fade + slide up */
function FadeSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Scroll-triggered scale + fade in */
function ScaleSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.85, y: 30 }}
      animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Scroll-triggered slide from left / right */
function SlideIn({
  children,
  className = "",
  delay = 0,
  direction = "left",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "left" | "right";
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const x = direction === "left" ? -60 : 60;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Animated road-themed section divider */
function RoadDivider({ flip = false }: { flip?: boolean }) {
  return (
    <div className="relative overflow-hidden" style={{ height: 48, background: "#0a0e1a" }}>
      {/* Road surface with moving dashes */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 4,
          background: "#1f2937",
          transform: "translateY(-50%)",
        }}
      >
        <motion.div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "200%",
            height: 4,
            background:
              "repeating-linear-gradient(to right, #f97316 0px, #f97316 20px, transparent 20px, transparent 40px)",
          }}
          animate={{ x: flip ? [-40, 0] : [0, -40] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
      </div>
      {/* Mini cones on the sides */}
      <div style={{ position: "absolute", top: "50%", left: 24, transform: "translateY(-70%)" }}>
        <TrafficConeMascot style={{ width: 20, height: 25 }} />
      </div>
      <div style={{ position: "absolute", top: "50%", right: 24, transform: "translateY(-70%)" }}>
        <TrafficConeMascot style={{ width: 20, height: 25 }} />
      </div>
    </div>
  );
}

/** Stat counter with bounce-in animation */
function StatCounter({
  value,
  suffix,
  label,
  delay = 0,
}: {
  value: string;
  suffix?: string;
  label: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.5, y: 30 }}
      animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.34, 1.56, 0.64, 1] }}
      className="text-center"
    >
      <div className="text-4xl md:text-5xl font-extrabold text-white tabular-nums">
        {value}
        {suffix && <span className="text-orange-400">{suffix}</span>}
      </div>
      <p className="text-white/50 text-sm font-medium mt-1">{label}</p>
    </motion.div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAIN COMPONENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function LandingPage({ onOpenRegistry }: LandingPageProps) {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const features = [
    {
      icon: <Database size={24} />,
      title: "Central Road Registry",
      desc: "500+ road segments with 32 data attributes per record. Search, filter and export Maharashtra's highway data instantly.",
      color: "#2563eb",
    },
    {
      icon: <Activity size={24} />,
      title: "Health Scoring (CIBIL-style)",
      desc: "Every road gets a 0–1000 rating across 4 civil engineering parameters — PCI, RSL, Drainage & Ride Quality.",
      color: "#059669",
    },
    {
      icon: <Gauge size={24} />,
      title: "Band Classification",
      desc: "A+ to E banding system prioritizes maintenance. Worst-first allocation ensures funds reach critical roads immediately.",
      color: "#f59e0b",
    },
    {
      icon: <Eye size={24} />,
      title: "Live Inspection Tracking",
      desc: "Timeline of inspections per road with damage %, drainage status and waterlogging flags for every agency visit.",
      color: "#8b5cf6",
    },
    {
      icon: <Truck size={24} />,
      title: "Traffic Intelligence",
      desc: "ADT counts, truck percentages and load impact estimation help predict pavement degradation before it happens.",
      color: "#ec4899",
    },
    {
      icon: <MapPin size={24} />,
      title: "Geo-Risk Profiling",
      desc: "Landslide, flood, ghat section and monsoon rainfall flags tagged per segment. Risk-aware budgeting made easy.",
      color: "#ef4444",
    },
  ];

  const workflow = [
    { step: "01", title: "Data Ingestion", desc: "CSV import of road registry & inspection records", icon: <Layers size={20} /> },
    { step: "02", title: "Health Computation", desc: "4-parameter scoring engine rates each road 0–1000", icon: <Gauge size={20} /> },
    { step: "03", title: "Band Classification", desc: "Roads categorized A+ to E for priority ranking", icon: <BarChart3 size={20} /> },
    { step: "04", title: "Actionable Insights", desc: "Repair costs, inspection schedules & risk alerts", icon: <Zap size={20} /> },
  ];

  /* Stagger variants for container animations */
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.9 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    },
  };

  return (
    <div className="relative overflow-hidden">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO SECTION — Highway themed with mascots
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        ref={heroRef}
        className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0c1220 0%, #0f1d32 25%, #14284a 50%, #1a365d 75%, #0f1d32 100%)" }}
      >
        {/* Subtle radial glow overlays */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(251,146,60,0.12) 0%, transparent 70%), radial-gradient(ellipse 40% 60% at 80% 80%, rgba(59,130,246,0.06) 0%, transparent 60%)" }}
        />

        {/* Background parallax layer */}
        <motion.div style={{ y: heroY }} className="absolute inset-0 pointer-events-none">
          {/* Animated highway stripes */}
          <div className="absolute inset-0" style={{ opacity: 0.06 }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "30%", width: 3, background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 28px, #fff 28px, #fff 56px)" }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, right: "30%", width: 3, background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 28px, #fff 28px, #fff 56px)" }} />
          </div>
        </motion.div>

        {/* ── FLOATING MASCOTS & ROAD ELEMENTS ── */}

        {/* Left — Traffic Cone Mascot */}
        <motion.div
          className="absolute hidden md:block"
          style={{ left: "5vw", top: "22vh", zIndex: 5 }}
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.2, duration: 1 }}
        >
          <FloatingElement delay={0} duration={5} yRange={15} rotateRange={5}>
            <TrafficConeMascot style={{ width: 70, height: 90 }} />
          </FloatingElement>
        </motion.div>

        {/* Right — Hard Hat Worker Mascot */}
        <motion.div
          className="absolute hidden md:block"
          style={{ right: "4vw", top: "18vh", zIndex: 5 }}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.4, duration: 1 }}
        >
          <FloatingElement delay={0.5} duration={6} yRange={12} rotateRange={3}>
            <HardHatWorkerMascot style={{ width: 100, height: 125 }} />
          </FloatingElement>
        </motion.div>

        {/* Floating road signs — scattered */}
        <motion.div
          className="absolute hidden lg:block"
          style={{ left: "12vw", bottom: "22vh", zIndex: 3 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8, duration: 1.2 }}
        >
          <FloatingElement delay={1} duration={7} yRange={18} rotateRange={8}>
            <RoadSignSVG text="!" style={{ width: 40, height: 52, opacity: 0.5 }} />
          </FloatingElement>
        </motion.div>

        <motion.div
          className="absolute hidden lg:block"
          style={{ right: "14vw", bottom: "28vh", zIndex: 3 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1.2 }}
        >
          <FloatingElement delay={2} duration={8} yRange={10} rotateRange={5}>
            <RoadSignSVG text="NH" style={{ width: 35, height: 45, opacity: 0.4 }} />
          </FloatingElement>
        </motion.div>

        {/* Floating barriers */}
        <motion.div
          className="absolute hidden lg:block"
          style={{ left: "18vw", top: "62vh", zIndex: 2 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2, duration: 1 }}
        >
          <FloatingElement delay={0.8} duration={6} yRange={8} rotateRange={4}>
            <RoadBarrierSVG style={{ width: 70, height: 28, opacity: 0.35 }} />
          </FloatingElement>
        </motion.div>

        <motion.div
          className="absolute hidden lg:block"
          style={{ right: "16vw", top: "67vh", zIndex: 2 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.4, duration: 1 }}
        >
          <FloatingElement delay={1.5} duration={7} yRange={10} rotateRange={6}>
            <RoadBarrierSVG style={{ width: 60, height: 24, opacity: 0.3 }} />
          </FloatingElement>
        </motion.div>

        {/* Second traffic cone — bottom right */}
        <motion.div
          className="absolute hidden xl:block"
          style={{ right: "8vw", bottom: "18vh", zIndex: 4 }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 1 }}
        >
          <FloatingElement delay={0.3} duration={5.5} yRange={14} rotateRange={6}>
            <TrafficConeMascot style={{ width: 48, height: 60 }} />
          </FloatingElement>
        </motion.div>

        {/* ── Animated road at bottom of hero ── */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: 50, zIndex: 4 }}>
          {/* Road surface */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 36, background: "#1a1a2e" }}>
            {/* Animated center dashes */}
            <motion.div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                width: "200%",
                height: 3,
                background: "repeating-linear-gradient(to right, #f97316 0px, #f97316 30px, transparent 30px, transparent 60px)",
                transform: "translateY(-50%)",
              }}
              animate={{ x: [-60, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          {/* Road edge line */}
          <div style={{ position: "absolute", bottom: 36, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Overlay gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(10,14,26,1) 100%)" }}
        />

        {/* Hero content */}
        <motion.div
          style={{ opacity: heroOpacity }}
          className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto px-6"
        >
          {/* Government badge */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm"
          >
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-[12px] font-semibold text-white/80 tracking-wide uppercase">
              Government of Maharashtra • Public Works Department
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[0.95]"
          >
            <span className="text-white">Road</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-orange-500 to-yellow-400">
              Rakshak
            </span>
          </motion.h1>

          {/* Tagline badge with shield icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.55, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className="mt-5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{ background: "rgba(249, 115, 22, 0.15)", border: "1px solid rgba(249, 115, 22, 0.3)" }}
          >
            <Shield size={14} className="text-orange-400" />
            <span className="text-orange-300 text-[12px] font-bold tracking-wider uppercase">
              Protecting Roads • Saving Lives
            </span>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mt-8 text-lg md:text-xl text-white/55 max-w-2xl mx-auto leading-[1.8] font-light mt-2 mb-4 px-3 py-1"
          >
            Digital road condition management — monitoring, scoring & healing
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.8 }}
            className="mt-1 text-lg md:text-xl text-white/80 font-medium"
          >
            Maharashtra&apos;s National Highways.
          </motion.p>

          {/* NH badge row — pop-in one by one */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="mt-12 flex items-center justify-center gap-3 flex-wrap"
          >
            {["NH-48", "NH-44", "NH-66", "NH-60", "NH-61", "NH-753"].map((nh, i) => (
              <motion.span
                key={nh}
                className="nh-badge"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.9 + i * 0.08, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              >
                {nh}
              </motion.span>
            ))}
          </motion.div>

          {/* CTA buttons with spring hover */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-5"
          >
            <motion.button
              onClick={onOpenRegistry}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="group inline-flex items-center gap-2.5 px-8 h-14 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-[15px] shadow-2xl shadow-orange-500/30 transition-colors"
            >
              Explore Road Registry
              <ArrowRight
                size={18}
                className="group-hover:translate-x-1 transition-transform"
              />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-6 h-14 rounded-2xl bg-white/10 border border-white/20 text-white/90 font-semibold text-[14px] backdrop-blur-sm transition-all"
            >
              <Globe size={16} />
              View Analytics
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/60 ml-1">
                SOON
              </span>
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ zIndex: 10 }}
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">
            Scroll
          </span>
          <ChevronDown size={18} className="text-white/40 animate-bounce" />
        </motion.div>
      </section>

      {/* ── Road Divider ── */}
      <RoadDivider />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          STATS STRIP — with bounce-in & decorations
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative py-20" style={{ background: "#0a0e1a" }}>
        {/* Faint construction decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div style={{ position: "absolute", left: "3%", top: "15%" }}>
            <FloatingElement delay={0} duration={8} yRange={15} rotateRange={10}>
              <RoadBarrierSVG style={{ width: 50, height: 20, opacity: 0.06 }} />
            </FloatingElement>
          </div>
          <div style={{ position: "absolute", right: "5%", bottom: "15%" }}>
            <FloatingElement delay={2} duration={9} yRange={12} rotateRange={5}>
              <TrafficConeMascot style={{ width: 28, height: 36, opacity: 0.08 }} />
            </FloatingElement>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-10">
          <StatCounter value="500" suffix="+" label="Road Segments" delay={0} />
          <StatCounter value="12,000" suffix=" km" label="Highways Monitored" delay={0.15} />
          <StatCounter value="36" label="Districts Covered" delay={0.3} />
          <StatCounter value="2,500" suffix="+" label="Inspections Logged" delay={0.45} />
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FEATURES — 6 cards with stagger & hover spring
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-24 relative" style={{ background: "#f8f9fb" }}>
        {/* Floating decorative construction elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div style={{ position: "absolute", left: "2%", top: "12%" }}>
            <FloatingElement delay={0} duration={10} yRange={20} rotateRange={8}>
              <TrafficConeMascot style={{ width: 40, height: 50, opacity: 0.07 }} />
            </FloatingElement>
          </div>
          <div style={{ position: "absolute", right: "3%", bottom: "15%" }}>
            <FloatingElement delay={3} duration={11} yRange={15} rotateRange={6}>
              <RoadRollerSVG style={{ width: 80, height: 45, opacity: 0.05 }} />
            </FloatingElement>
          </div>
          <div style={{ position: "absolute", right: "8%", top: "8%" }}>
            <FloatingElement delay={1.5} duration={9} yRange={12} rotateRange={4}>
              <RoadSignSVG text="!" style={{ width: 30, height: 40, opacity: 0.08 }} />
            </FloatingElement>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <FadeSection className="text-center mb-16">
            <span className="inline-block px-3.5 py-1.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold uppercase tracking-wider mb-5">
              Platform Features
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
              Everything you need to <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-700">
                manage road infrastructure
              </span>
            </h2>
            <p className="text-gray-500 text-[15px] mt-4 max-w-lg mx-auto leading-relaxed">
              A unified platform for road condition tracking, health scoring, and data-driven maintenance planning.
            </p>
          </FadeSection>

          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            {features.map((f) => (
              <motion.div key={f.title} variants={itemVariants}>
                <motion.div
                  className="feature-card group text-center"
                  whileHover={{ y: -8, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.12)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <motion.div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 mx-auto"
                    style={{ background: `${f.color}12`, color: f.color }}
                    whileHover={{ scale: 1.2, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                  >
                    {f.icon}
                  </motion.div>
                  <h3 className="text-[16px] font-bold text-gray-900 mb-2">
                    {f.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-gray-500 max-w-[280px] mx-auto">
                    {f.desc}
                  </p>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Road Divider (reversed direction) ── */}
      <RoadDivider flip />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HOW IT WORKS — 4-step roadway + road roller
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-24 relative" style={{ background: "#ffffff" }}>
        <div className="max-w-6xl mx-auto px-6">
          <FadeSection className="text-center mb-16">
            <span className="inline-block px-3.5 py-1.5 rounded-full bg-green-100 text-green-700 text-[11px] font-bold uppercase tracking-wider mb-5">
              How It Works
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
              From raw data to <span className="text-green-600">actionable intelligence</span>
            </h2>
            <p className="text-gray-500 text-[15px] mt-4 max-w-md mx-auto leading-relaxed">
              Four simple steps from data collection to maintenance priorities.
            </p>
          </FadeSection>

          <div className="relative">
            {/* Connecting road line */}
            <div className="hidden md:block absolute top-[48px] left-[60px] right-[60px] h-[3px]">
              <div className="h-full bg-gray-200 rounded-full relative overflow-hidden">
                <div className="road-dash-line" />
              </div>
            </div>

            <motion.div
              className="grid md:grid-cols-4 gap-8"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              {workflow.map((w) => (
                <motion.div key={w.step} variants={itemVariants}>
                  <div className="relative text-center">
                    <motion.div
                      className="w-24 h-24 mx-auto rounded-3xl bg-gray-50 border-2 border-gray-200 flex items-center justify-center relative z-10 group"
                      whileHover={{ scale: 1.1, borderColor: "#fb923c", backgroundColor: "#fff7ed" }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    >
                      <div className="text-gray-500 group-hover:text-orange-600 transition-colors">
                        {w.icon}
                      </div>
                      <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center shadow-md">
                        {w.step}
                      </span>
                    </motion.div>
                    <h4 className="text-[15px] font-bold text-gray-900 mt-5">
                      {w.title}
                    </h4>
                    <p className="text-[13px] text-gray-500 mt-1.5">
                      {w.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Road Roller illustration below workflow */}
            <ScaleSection className="flex justify-center mt-14" delay={0.4}>
              <div className="relative">
                <motion.div
                  animate={{ x: [-5, 5, -5] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <RoadRollerSVG style={{ width: 180, height: 100 }} />
                </motion.div>
                {/* Shadow underneath */}
                <motion.div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 rounded-full"
                  style={{ width: 140, background: "radial-gradient(ellipse, rgba(0,0,0,0.1), transparent)" }}
                  animate={{ scaleX: [0.8, 1, 0.8] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </ScaleSection>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HEALTH SCORING — visual explainer
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-24 relative" style={{ background: "#f8f9fb" }}>
        {/* Floating decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div style={{ position: "absolute", left: "4%", bottom: "18%" }}>
            <FloatingElement delay={0} duration={9} yRange={18} rotateRange={7}>
              <HardHatWorkerMascot style={{ width: 50, height: 60, opacity: 0.05 }} />
            </FloatingElement>
          </div>
          <div style={{ position: "absolute", right: "4%", top: "12%" }}>
            <FloatingElement delay={2} duration={10} yRange={14} rotateRange={5}>
              <TrafficConeMascot style={{ width: 30, height: 38, opacity: 0.06 }} />
            </FloatingElement>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <FadeSection className="text-center mb-14">
            <span className="inline-block px-3.5 py-1.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold uppercase tracking-wider mb-5">
              Scoring Engine
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
              CIBIL-style ratings <span className="text-blue-600">for every road</span>
            </h2>
            <p className="text-gray-500 text-[15px] mt-4 max-w-lg mx-auto leading-relaxed">
              Each road segment is evaluated across 4 civil engineering parameters,
              producing a composite score from 0–1000 and a band from A+ to E.
            </p>
          </FadeSection>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <SlideIn direction="left">
              <h3 className="text-xl font-bold text-gray-900 mb-6 text-center lg:text-left">Parameter Breakdown</h3>

              <div className="mt-4 space-y-5">
                {[
                  { name: "PCI — Pavement Condition", weight: "30%", value: 78, color: "#22c55e" },
                  { name: "RSL — Structural Life", weight: "25%", value: 62, color: "#3b82f6" },
                  { name: "DRN — Drainage", weight: "25%", value: 45, color: "#eab308" },
                  { name: "RQL — Ride Quality", weight: "20%", value: 85, color: "#8b5cf6" },
                ].map((p, i) => (
                  <FadeSection key={p.name} delay={i * 0.1}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-semibold text-gray-700">{p.name}</span>
                          <span className="text-[11px] font-bold text-gray-400">{p.weight}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: p.color }}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${p.value}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.2, delay: 0.3 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-bold tabular-nums" style={{ color: p.color }}>
                        {p.value}
                      </span>
                    </div>
                  </FadeSection>
                ))}
              </div>
            </SlideIn>

            {/* Visual band card */}
            <SlideIn direction="right" delay={0.2}>
              <div className="relative">
                <div className="score-card-hero">
                  <div className="text-center mb-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                      Health Rating
                    </p>
                    <motion.div
                      className="text-6xl font-extrabold text-gray-900 mt-2 tabular-nums"
                      initial={{ scale: 0.5, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                    >
                      741
                    </motion.div>
                    <p className="text-sm font-semibold text-green-600 mt-1">Good Condition</p>
                  </div>

                  {/* Band scale */}
                  <div className="h-4 rounded-full overflow-hidden bg-gradient-to-r from-red-800 via-red-500 via-orange-400 via-yellow-400 via-green-400 to-emerald-600 relative">
                    <motion.div
                      className="absolute top-1/2 w-5 h-5 rounded-full bg-white border-[3px] border-green-500 shadow-lg"
                      style={{ transform: "translate(-50%, -50%)" }}
                      initial={{ left: "0%" }}
                      whileInView={{ left: "74.1%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 font-semibold mt-2 px-1">
                    <span>E</span><span>D</span><span>C</span><span>B</span><span>A</span><span>A+</span>
                  </div>

                  {/* Band badges with stagger */}
                  <motion.div
                    className="flex justify-center gap-2 mt-6"
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                  >
                    {[
                      { band: "A+", color: "#059669" },
                      { band: "A", color: "#22c55e", active: true },
                      { band: "B", color: "#eab308" },
                      { band: "C", color: "#f97316" },
                      { band: "D", color: "#ef4444" },
                      { band: "E", color: "#991b1b" },
                    ].map((b) => (
                      <motion.div
                        key={b.band}
                        variants={{
                          hidden: { opacity: 0, scale: 0, rotate: -20 },
                          visible: {
                            opacity: 1,
                            scale: 1,
                            rotate: 0,
                            transition: { type: "spring", stiffness: 200, damping: 12 },
                          },
                        }}
                        whileHover={{ scale: 1.2, rotate: 5 }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white cursor-default ${
                          b.active ? "ring-2 ring-offset-2 ring-green-500 scale-110" : "opacity-50"
                        }`}
                        style={{ background: b.color }}
                      >
                        {b.band}
                      </motion.div>
                    ))}
                  </motion.div>
                </div>

                {/* Decorative floating elements */}
                <motion.div
                  className="absolute -top-4 -right-4 w-20 h-20 rounded-2xl bg-orange-100 -z-10"
                  animate={{ rotate: [0, 8, 0], scale: [1, 1.05, 1] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute -bottom-4 -left-4 w-16 h-16 rounded-2xl bg-blue-100 -z-10"
                  animate={{ rotate: [0, -8, 0], scale: [1, 1.08, 1] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                />
                {/* Cone mascot peeking from corner */}
                <motion.div
                  className="absolute -bottom-6 -right-6 hidden md:block"
                  animate={{ y: [0, -5, 0], rotate: [0, 3, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <TrafficConeMascot style={{ width: 35, height: 45 }} />
                </motion.div>
              </div>
            </SlideIn>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CTA SECTION — with floating construction mascots
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="py-24 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }}
      >
        {/* Highway pattern bg */}
        <div className="absolute inset-0" style={{ opacity: 0.03 }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "30%", width: 3, background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 28px, #fff 28px, #fff 56px)" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, right: "30%", width: 3, background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 28px, #fff 28px, #fff 56px)" }} />
        </div>

        {/* Floating construction mascots */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div style={{ position: "absolute", left: "5%", bottom: "15%" }}>
            <FloatingElement delay={0} duration={7} yRange={15} rotateRange={5}>
              <HardHatWorkerMascot style={{ width: 60, height: 75, opacity: 0.1 }} />
            </FloatingElement>
          </div>
          <div style={{ position: "absolute", right: "5%", top: "15%" }}>
            <FloatingElement delay={1} duration={8} yRange={12} rotateRange={8}>
              <TrafficConeMascot style={{ width: 45, height: 56, opacity: 0.12 }} />
            </FloatingElement>
          </div>
          <div style={{ position: "absolute", left: "15%", top: "10%" }}>
            <FloatingElement delay={2} duration={9} yRange={10} rotateRange={4}>
              <RoadBarrierSVG style={{ width: 70, height: 28, opacity: 0.07 }} />
            </FloatingElement>
          </div>
          <div style={{ position: "absolute", right: "18%", bottom: "10%" }}>
            <FloatingElement delay={3} duration={10} yRange={18} rotateRange={6}>
              <RoadSignSVG text="→" style={{ width: 35, height: 45, opacity: 0.08 }} />
            </FloatingElement>
          </div>
        </div>

        <ScaleSection className="relative z-10 text-center max-w-3xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Ready to transform<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
              road management?
            </span>
          </h2>
          <p className="text-white/50 mt-6 text-lg max-w-xl mx-auto leading-relaxed">
            Access the Central Road Registry — search, filter and analyze 500+ road segments across Maharashtra.
          </p>
          <motion.button
            onClick={onOpenRegistry}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="group mt-10 inline-flex items-center gap-2.5 px-10 h-14 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-[15px] shadow-2xl shadow-orange-500/30 transition-colors"
          >
            Open Road Registry
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </ScaleSection>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FOOTER — GDG-style card layout
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="relative overflow-hidden" style={{ background: "#0a0e1a" }}>
        {/* Colorful bokeh blobs behind the card */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: "absolute", top: "20%", left: "35%", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(251,146,60,0.18), transparent 70%)", filter: "blur(60px)" }} />
          <div style={{ position: "absolute", top: "40%", right: "30%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.14), transparent 70%)", filter: "blur(50px)" }} />
          <div style={{ position: "absolute", bottom: "10%", left: "50%", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.10), transparent 70%)", filter: "blur(50px)" }} />
        </div>

        {/* Subtle star-like dots */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.15 }}>
          {[
            { top: "8%", left: "12%" }, { top: "15%", left: "45%" }, { top: "5%", right: "18%" },
            { top: "25%", left: "78%" }, { top: "60%", left: "8%" }, { top: "70%", right: "12%" },
            { top: "45%", left: "22%" }, { top: "55%", right: "35%" },
          ].map((pos, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-white"
              style={pos}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-8">
          {/* Main card */}
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: "48px 48px 40px",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
              {/* Left — Brand + Description + Social */}
              <div className="md:col-span-1">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                    <Shield size={18} className="text-white" />
                  </div>
                  <span className="text-white font-bold text-lg">
                    Road<span className="text-orange-400">Rakshak</span>
                  </span>
                </div>
                <p className="text-white/50 text-[13px] leading-relaxed mb-6 max-w-xs">
                  A digital road condition management system for Maharashtra&apos;s highways. Monitoring, scoring &amp; healing — empowering data-driven infrastructure decisions.
                </p>

                {/* Social icons */}
                <div className="flex items-center gap-4">
                  {/* GitHub */}
                  <a href="#" className="text-white/40 hover:text-white transition-colors">
                    <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  </a>
                  {/* Twitter / X */}
                  <a href="#" className="text-white/40 hover:text-white transition-colors">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                  {/* LinkedIn */}
                  <a href="#" className="text-white/40 hover:text-white transition-colors">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  </a>
                  {/* Mail */}
                  <a href="#" className="text-white/40 hover:text-white transition-colors">
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </a>
                </div>
              </div>

              {/* Middle — Quick Links */}
              <div className="md:col-span-1">
                <h4 className="text-white font-bold text-[15px] mb-5">Quick Links</h4>
                <ul className="space-y-3">
                  {[
                    { label: "Home", action: "home" },
                    { label: "Road Registry", action: "registry" },
                    { label: "Health Scoring", action: "scoring" },
                    { label: "How It Works", action: "workflow" },
                    { label: "Features", action: "features" },
                  ].map((link) => (
                    <li key={link.action}>
                      <button
                        onClick={link.action === "registry" ? onOpenRegistry : undefined}
                        className="text-white/50 hover:text-orange-400 text-[13px] transition-colors cursor-pointer bg-transparent border-none p-0"
                      >
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right — Contact */}
              <div className="md:col-span-1">
                <h4 className="text-white font-bold text-[15px] mb-5">Contact Us</h4>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-white/40 mt-0.5 shrink-0"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    <div>
                      <p className="text-white/70 text-[13px] font-semibold">Email</p>
                      <p className="text-white/40 text-[13px]">pwd@maharashtra.gov.in</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-white/40 mt-0.5 shrink-0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                    <div>
                      <p className="text-white/70 text-[13px] font-semibold">Office</p>
                      <p className="text-white/40 text-[13px]">Public Works Department,<br />Mantralaya, Mumbai 400032</p>
                    </div>
                  </div>
                </div>

                {/* Mini mascot row */}
                <div className="flex items-end gap-3 mt-6">
                  <motion.div
                    animate={{ rotate: [-3, 3, -3] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <TrafficConeMascot style={{ width: 22, height: 28 }} />
                  </motion.div>
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <HardHatWorkerMascot style={{ width: 28, height: 35 }} />
                  </motion.div>
                  <motion.div
                    animate={{ rotate: [3, -3, 3] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <TrafficConeMascot style={{ width: 22, height: 28 }} />
                  </motion.div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="mt-10 mb-6" style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

            {/* Copyright */}
            <p className="text-center text-white/30 text-[13px]">
              &copy; 2026 Road Rakshak &bull; Government of Maharashtra. All rights reserved.
            </p>
          </div>
        </div>

        {/* Large watermark text — scroll-triggered pop from bottom */}
        <div className="relative overflow-hidden" style={{ height: 140 }}>
          <motion.div
            className="absolute bottom-0 left-0 right-0 text-center select-none pointer-events-none"
            initial={{ opacity: 0, y: 80 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-20px" }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: "clamp(80px, 12vw, 160px)",
              fontWeight: 900,
              lineHeight: 1,
              color: "transparent",
              WebkitTextStroke: "2px rgba(255,255,255,0.15)",
              letterSpacing: "0.05em",
              transform: "translateY(20%)",
            }}
          >
            ROAD RAKSHAK
          </motion.div>
        </div>
      </footer>
    </div>
  );
}

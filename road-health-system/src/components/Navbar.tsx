"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Shield, Menu, X, Home } from "lucide-react";

type PageId = "landing" | "registry" | "scheduling" | "geoview" | "reports" | "complaints";

interface NavbarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
}

const DASHBOARD_TABS = [
  { id: "geoview"    as const, label: "🗺 GeoView" },
  { id: "complaints" as const, label: "📞 Complaints" },
  { id: "reports"    as const, label: "Reports" },
  { id: "scheduling" as const, label: "Scheduler" },
  { id: "registry"   as const, label: "Road Registry" },
];

export default function Navbar({ currentPage, onNavigate }: NavbarProps) {
  const [scrolled, setScrolled]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Sliding indicator state
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  // Update indicator position on tab/page change or resize
  useLayoutEffect(() => {
    const idx = DASHBOARD_TABS.findIndex(t => t.id === currentPage);
    const el = tabRefs.current[idx];
    if (el) {
      const { left, width } = el.getBoundingClientRect();
      const parentLeft = el.parentElement?.getBoundingClientRect().left || 0;
      setIndicator({ left: left - parentLeft, width });
    }
  }, [currentPage, mobileOpen]);
  useEffect(() => {
    const onResize = () => {
      const idx = DASHBOARD_TABS.findIndex(t => t.id === currentPage);
      const el = tabRefs.current[idx];
      if (el) {
        const { left, width } = el.getBoundingClientRect();
        const parentLeft = el.parentElement?.getBoundingClientRect().left || 0;
        setIndicator({ left: left - parentLeft, width });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [currentPage, mobileOpen]);

  return (
    <>
      {/* ── Floating pill navbar ── */}
      <div className="fixed top-4 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
        <nav
          className="pointer-events-auto flex items-center gap-1 px-2 py-2 rounded-2xl transition-all duration-300"
          style={{
            background: "rgba(255, 255, 255, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.55)",
            boxShadow: scrolled
              ? "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)"
              : "0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          {/* Logo */}
          <button
            onClick={() => onNavigate("landing")}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl group transition-all hover:bg-orange-50"
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
              <Shield size={14} className="text-white" />
            </div>
            <span className="text-[14px] font-extrabold tracking-tight text-gray-900 hidden sm:block">
              Road<span className="text-orange-500">Rakshak</span>
            </span>
          </button>

          {/* Divider */}
          <div className="w-px h-5 rounded-full mx-1" style={{ background: "rgba(0,0,0,0.1)" }} />

          {/* Desktop tabs */}
          <div className="hidden md:flex items-center gap-0.5 relative" style={{ minWidth: 0 }}>
            {/* Sliding indicator */}
            <div
              className="absolute top-0 left-0 h-full z-0 transition-all duration-300"
              style={{
                transform: `translateX(${indicator.left}px)`,
                width: indicator.width,
                background: "linear-gradient(135deg, #fff7ed, #ffedd5)",
                borderRadius: 12,
                boxShadow: "0 1px 4px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
                border: "1px solid rgba(249,115,22,0.18)",
                transition: "transform 0.32s cubic-bezier(.6,.2,.3,1), width 0.32s cubic-bezier(.6,.2,.3,1)",
                pointerEvents: "none",
              }}
            />
            {DASHBOARD_TABS.map((item, i) => (
              <button
                key={item.id}
                ref={el => { tabRefs.current[i] = el; }}
                onClick={() => onNavigate(item.id)}
                className="relative px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all z-10 bg-transparent"
                style={
                  currentPage === item.id
                    ? { color: "#c2410c" }
                    : { color: "#6b7280" }
                }
                onMouseEnter={e => { if (currentPage !== item.id) (e.currentTarget as HTMLElement).style.cssText += ";background:rgba(0,0,0,0.04);color:#111827"; }}
                onMouseLeave={e => { if (currentPage !== item.id) (e.currentTarget as HTMLElement).style.cssText = "color:#6b7280;background:transparent"; }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 rounded-full mx-1 hidden md:block" style={{ background: "rgba(0,0,0,0.1)" }} />

          {/* Home pill */}
          <button
            onClick={() => onNavigate("landing")}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all"
            style={{ color: "#9ca3af", border: "1px solid transparent" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.cssText += ";background:rgba(0,0,0,0.04);color:#374151"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.cssText = "color:#9ca3af;border:1px solid transparent"; }}
          >
            <Home size={12} />
            Home
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-xl transition-all text-gray-600 hover:bg-black/5"
          >
            {mobileOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </nav>
      </div>

      {/* Mobile dropdown — floats below the pill */}
      {mobileOpen && (
        <div
          className="fixed top-18 left-1/2 z-50 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.14)",
          }}
        >
          <div className="p-2 space-y-0.5">
            {DASHBOARD_TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                className="w-full text-left px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                style={
                  currentPage === item.id
                    ? { background: "linear-gradient(135deg,#fff7ed,#ffedd5)", color: "#c2410c" }
                    : { color: "#374151" }
                }
              >
                {item.label}
              </button>
            ))}
            <div className="mx-2 my-1 h-px" style={{ background: "rgba(0,0,0,0.07)" }} />
            <button
              onClick={() => { onNavigate("landing"); setMobileOpen(false); }}
              className="w-full text-left px-4 py-2.5 rounded-xl text-[13px] font-medium text-gray-400 flex items-center gap-2 hover:bg-black/5 transition-all"
            >
              <Home size={14} /> Back to Home
            </button>
          </div>
        </div>
      )}
    </>
  );
}

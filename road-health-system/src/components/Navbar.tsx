"use client";

import { useState, useEffect } from "react";
import { Shield, Menu, X } from "lucide-react";

type PageId = "landing" | "registry" | "scheduling" | "geoview" | "reports" | "complaints";

interface NavbarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
}

export default function Navbar({ currentPage, onNavigate }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  const isLanding = currentPage === "landing";

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled || !isLanding
          ? "bg-white/90 backdrop-blur-xl border-b border-gray-200/60 shadow-sm"
          : "bg-transparent"
      }`}
    >
      {/* Road-style top accent line */}
      <div className="h-[3px] w-full bg-gradient-to-r from-orange-500 via-white to-green-600" />

      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <button
          onClick={() => onNavigate("landing")}
          className="flex items-center gap-2.5 group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-md shadow-orange-500/20 group-hover:shadow-orange-500/40 transition-shadow">
            <Shield size={18} className="text-white" />
          </div>
          <div className="leading-tight">
            <span
              className={`text-[17px] font-extrabold tracking-tight transition-colors ${
                scrolled || !isLanding ? "text-gray-900" : "text-white"
              }`}
            >
              Road<span className="text-orange-500">Rakshak</span>
            </span>
            <p
              className={`text-[9px] font-semibold uppercase tracking-[0.15em] transition-colors ${
                scrolled || !isLanding ? "text-gray-400" : "text-white/60"
              }`}
            >
              Maharashtra PWD
            </p>
          </div>
        </button>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {[
            { id: "landing" as const, label: "Home" },
            { id: "registry" as const, label: "Road Registry" },
            { id: "scheduling" as const, label: "Inspection Scheduler" },
            { id: "geoview" as const, label: "GeoView" },
            { id: "reports" as const, label: "Reports" },
            { id: "complaints" as const, label: "📞 Complaints" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                currentPage === item.id
                  ? scrolled || !isLanding
                    ? "bg-orange-50 text-orange-700"
                    : "bg-white/15 text-white"
                  : scrolled || !isLanding
                  ? "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* CTA + Mobile */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`md:hidden p-2 rounded-lg transition ${
              scrolled || !isLanding ? "text-gray-600" : "text-white"
            }`}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-xl">
          <div className="px-4 py-3 space-y-1">
            {[
              { id: "landing" as const, label: "Home" },
              { id: "registry" as const, label: "Road Registry" },
              { id: "scheduling" as const, label: "Inspection Scheduler" },
              { id: "geoview" as const, label: "GeoView" },
              { id: "reports" as const, label: "Reports" },
              { id: "complaints" as const, label: "📞 Complaints" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                  currentPage === item.id
                    ? "bg-orange-50 text-orange-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

"use client";

import {
  Database,
  Shield,
  BarChart3,
  Map,
  FileText,
  Settings,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navSections = [
  {
    title: "Main",
    items: [
      { id: "registry", label: "Road Registry", icon: Database, active: true },
      { id: "analytics", label: "Analytics", icon: BarChart3, active: false, badge: "Soon" },
      { id: "map", label: "Road Map", icon: Map, active: false, badge: "Soon" },
    ],
  },
  {
    title: "Management",
    items: [
      { id: "reports", label: "Reports", icon: FileText, active: false, badge: "Soon" },
      { id: "settings", label: "Settings", icon: Settings, active: false },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className="fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-gray-200/60 transition-all duration-300 ease-in-out"
      style={{ background: "#ffffff", width: collapsed ? 68 : 260 }}
    >
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-gray-100 transition-all duration-300 ${collapsed ? "justify-center px-2" : "gap-3 px-5"}`}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 shadow-sm shadow-blue-600/20 shrink-0">
          <Shield size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-[15px] font-bold text-gray-900 leading-tight tracking-tight whitespace-nowrap">
              RoadCIBIL
            </h1>
            <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase whitespace-nowrap">
              Maharashtra PWD
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.title} className="mb-5">
            {!collapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 mb-2">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center rounded-lg text-[13px] font-medium transition-all ${
                      collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2"
                    } ${
                      item.active
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={collapsed ? 18 : 16} className={item.active ? "text-blue-600" : "text-gray-400"} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
                        {item.badge && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Toggle + Footer */}
      <div className="px-2 py-3 border-t border-gray-100 space-y-1">
        {!collapsed && (
          <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all">
            <HelpCircle size={14} />
            <span>Help & Support</span>
          </button>
        )}
        <button
          onClick={onToggle}
          className={`w-full flex items-center rounded-lg text-[12px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all ${
            collapsed ? "justify-center py-2.5" : "gap-2.5 px-3 py-2"
          }`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && (
          <p className="text-[10px] text-gray-300 text-center mt-1">
            v1.0 — Innovate Techathon 2026
          </p>
        )}
      </div>
    </aside>
  );
}

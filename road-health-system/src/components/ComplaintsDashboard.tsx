"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  Inbox,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  User,
  XCircle,
  X,
  BarChart3,
  Shield,
  Activity,
  Radio,
  ChevronRight,
  Volume2,
  Camera,
  ImageIcon,
  Sparkles,
} from "lucide-react";
import {
  Complaint,
  ComplaintType,
  ComplaintSeverity,
  ComplaintStatus,
} from "@/lib/types";
import {
  getAllComplaints,
  updateComplaintStatus,
  seedDemoComplaints,
} from "@/lib/complaintStore";

/* ─── Constants ─────────────────────────────────────────── */

const TYPE_CONFIG: Record<
  ComplaintType,
  { label: string; icon: string; color: string; gradient: string }
> = {
  pothole: {
    label: "Pothole",
    icon: "🕳️",
    color: "text-red-700 bg-red-50 border-red-200",
    gradient: "from-red-500 to-rose-600",
  },
  crack: {
    label: "Road Crack",
    icon: "⚡",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    gradient: "from-amber-500 to-yellow-600",
  },
  waterlogging: {
    label: "Waterlogging",
    icon: "🌊",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    gradient: "from-blue-500 to-cyan-600",
  },
  debris: {
    label: "Debris",
    icon: "🪨",
    color: "text-stone-700 bg-stone-50 border-stone-200",
    gradient: "from-stone-500 to-stone-600",
  },
  missing_signage: {
    label: "Missing Sign",
    icon: "🚧",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    gradient: "from-amber-500 to-orange-600",
  },
  guardrail_damage: {
    label: "Guardrail",
    icon: "🛡️",
    color: "text-purple-700 bg-purple-50 border-purple-200",
    gradient: "from-purple-500 to-violet-600",
  },
  road_collapse: {
    label: "Collapse",
    icon: "💥",
    color: "text-rose-700 bg-rose-50 border-rose-200",
    gradient: "from-rose-500 to-red-700",
  },
  other: {
    label: "Other",
    icon: "📋",
    color: "text-slate-700 bg-slate-50 border-slate-200",
    gradient: "from-slate-500 to-slate-600",
  },
};

const SEVERITY_CONFIG: Record<
  ComplaintSeverity,
  { label: string; color: string; dot: string; ring: string }
> = {
  low: {
    label: "Low",
    color: "text-emerald-700 bg-emerald-50",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20",
  },
  medium: {
    label: "Medium",
    color: "text-yellow-700 bg-yellow-50",
    dot: "bg-yellow-500",
    ring: "ring-yellow-500/20",
  },
  high: {
    label: "High",
    color: "text-orange-700 bg-orange-50",
    dot: "bg-orange-500",
    ring: "ring-orange-500/20",
  },
  critical: {
    label: "Critical",
    color: "text-red-700 bg-red-50",
    dot: "bg-red-500",
    ring: "ring-red-500/20",
  },
};

const STATUS_CONFIG: Record<
  ComplaintStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  new: {
    label: "New",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    icon: <Radio size={11} className="animate-pulse" />,
  },
  acknowledged: {
    label: "Seen",
    color: "text-indigo-700 bg-indigo-50 border-indigo-200",
    icon: <Eye size={11} />,
  },
  "in-progress": {
    label: "In Progress",
    color: "text-orange-700 bg-orange-50 border-orange-200",
    icon: <RefreshCw size={11} />,
  },
  resolved: {
    label: "Resolved",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    icon: <CheckCircle2 size={11} />,
  },
  closed: {
    label: "Closed",
    color: "text-gray-600 bg-gray-100 border-gray-200",
    icon: <XCircle size={11} />,
  },
};

const SOURCE_CONFIG: Record<
  string,
  { label: string; icon: string; accent: string }
> = {
  ivr_voice: { label: "IVR Voice", icon: "🎤", accent: "text-violet-600" },
  ivr_keypad: { label: "IVR Keypad", icon: "📱", accent: "text-blue-600" },
  web_form: { label: "Web Form", icon: "🌐", accent: "text-teal-600" },
  telegram: { label: "Telegram", icon: "✈️", accent: "text-sky-600" },
  twilio_ivr: { label: "Phone IVR", icon: "📞", accent: "text-orange-600" },
  browser_voice: {
    label: "Browser AI",
    icon: "🧠",
    accent: "text-purple-600",
  },
  photo_upload: {
    label: "Photo Upload",
    icon: "📸",
    accent: "text-cyan-600",
  },
};

/* ─── Notification Toast ──────────────────────────────── */

interface ToastNotification {
  id: string;
  type: ComplaintType;
  severity: ComplaintSeverity;
  district: string;
  description: string;
  source: string;
  timestamp: number;
}

function NotificationToast({
  notification,
  onDismiss,
  onClick,
}: {
  notification: ToastNotification;
  onDismiss: () => void;
  onClick: () => void;
}) {
  const typeConf = TYPE_CONFIG[notification.type];
  const sevConf = SEVERITY_CONFIG[notification.severity];
  const sourceConf = SOURCE_CONFIG[notification.source] || {
    label: notification.source,
    icon: "📨",
    accent: "text-gray-600",
  };

  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="notification-toast animate-slide-down cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start gap-3 bg-white rounded-2xl shadow-2xl shadow-black/15 border border-gray-200/80 p-4 max-w-md backdrop-blur-xl">
        {/* Severity pulse */}
        <div className="relative shrink-0 mt-0.5">
          <div
            className={`w-10 h-10 rounded-xl bg-linear-to-br ${typeConf.gradient} flex items-center justify-center text-lg shadow-lg`}
          >
            {typeConf.icon}
          </div>
          {notification.severity === "critical" && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white animate-ping" />
          )}
          <span
            className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ${sevConf.dot} border-2 border-white`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
              New Complaint
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sevConf.color}`}
            >
              {sevConf.label}
            </span>
          </div>
          <p className="text-[13px] font-semibold text-gray-900 line-clamp-2 leading-snug">
            {notification.description}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <MapPin size={9} /> {notification.district}
            </span>
            <span className="text-[10px] text-gray-300">•</span>
            <span className={`text-[10px] ${sourceConf.accent} font-medium`}>
              {sourceConf.icon} {sourceConf.label}
            </span>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition opacity-0 group-hover:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ──────────────────────────────────── */

interface ComplaintsDashboardProps {
  refreshTrigger?: number;
}

export default function ComplaintsDashboard({
  refreshTrigger,
}: ComplaintsDashboardProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedComplaint, setSelectedComplaint] =
    useState<Complaint | null>(null);
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | "">("");
  const [filterSeverity, setFilterSeverity] = useState<
    ComplaintSeverity | ""
  >("");
  const [filterType, setFilterType] = useState<ComplaintType | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");
  const [ivrComplaints, setIvrComplaints] = useState<Complaint[]>([]);
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [notifCount, setNotifCount] = useState(0);

  // Track previously known complaint IDs to detect new ones
  const knownIdsRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Play notification sound
  const playNotifSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      // Second tone
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1100;
        osc2.type = "sine";
        gain2.gain.setValueAtTime(0.12, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.3);
      }, 150);
    } catch {
      /* ignore audio errors */
    }
  }, []);

  // Fetch IVR API complaints
  const fetchIVRComplaints = useCallback(async () => {
    try {
      const res = await fetch("/api/ivr/complaints");
      if (!res.ok) return;
      const data = await res.json();

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const mapped: Complaint[] = (data.complaints || []).map((c: any) => {
        const locParts = [
          c.road_name && c.road_name !== "unknown" ? c.road_name : null,
          c.landmark && c.landmark !== "unknown"
            ? `near ${c.landmark}`
            : null,
        ].filter(Boolean);
        const locationDesc =
          locParts.length > 0
            ? locParts.join(", ")
            : "Location details in transcript";
        const district =
          c.district && c.district !== "unknown"
            ? c.district
            : "Pending review";
        const division =
          c.division && c.division !== "unknown" ? c.division : undefined;
        const callerPhone =
          c.callerNumber && c.callerNumber !== "unknown"
            ? c.callerNumber
            : undefined;
        const citizenName = callerPhone
          ? `Caller ${callerPhone.replace(/^\+91/, "").replace(/^\+1/, "")}`
          : c.source === "browser_voice"
            ? "Web Reporter"
            : "Phone Caller";
        const description =
          c.description_en &&
          c.description_en !== c.rawTranscript &&
          !c.description_en.startsWith("[")
            ? c.description_en
            : c.rawTranscript && !c.rawTranscript.startsWith("[")
              ? c.rawTranscript
              : "Voice complaint — processing";

        return {
          id: c.id,
          timestamp: c.timestamp,
          district,
          location_description: locationDesc,
          complaint_type: c.complaint_type || "other",
          severity: c.severity || "medium",
          description,
          citizen_name: citizenName,
          citizen_phone: callerPhone || "—",
          source:
            c.source === "twilio_ivr" ? "twilio_ivr" : "browser_voice",
          status: c.status || "new",
          voice_transcript: c.rawTranscript,
          road_name:
            c.road_name && c.road_name !== "unknown"
              ? c.road_name
              : undefined,
          highway_ref:
            c.road_name &&
            c.road_name !== "unknown" &&
            c.road_name.match(/^[NS]H/)
              ? c.road_name
              : undefined,
          taluka: division,
          citizen_language:
            c.language_detected && c.language_detected !== "unknown"
              ? c.language_detected
              : undefined,
        } as Complaint;
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */

      // Detect new complaints and fire notifications
      const newOnes = mapped.filter((c) => !knownIdsRef.current.has(c.id));
      if (newOnes.length > 0 && knownIdsRef.current.size > 0) {
        newOnes.forEach((c) => {
          const notif: ToastNotification = {
            id: c.id,
            type: c.complaint_type,
            severity: c.severity,
            district: c.district,
            description: c.description,
            source: c.source,
            timestamp: Date.now(),
          };
          setNotifications((prev) => [notif, ...prev].slice(0, 5));
          setNotifCount((n) => n + 1);
        });
        playNotifSound();
      }
      mapped.forEach((c) => knownIdsRef.current.add(c.id));

      setIvrComplaints(mapped);
    } catch (err) {
      console.error("Failed to fetch IVR complaints:", err);
    }
  }, [playNotifSound]);

  // Load on mount
  useEffect(() => {
    seedDemoComplaints(4);
    const local = getAllComplaints();
    setComplaints(local);
    local.forEach((c) => knownIdsRef.current.add(c.id));
    fetchIVRComplaints();
  }, [fetchIVRComplaints]);

  // Poll for new IVR complaints every 5s
  useEffect(() => {
    pollRef.current = setInterval(fetchIVRComplaints, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchIVRComplaints]);

  // Refresh when parent triggers
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      setComplaints(getAllComplaints());
      fetchIVRComplaints();
    }
  }, [refreshTrigger, fetchIVRComplaints]);

  // Merge localStorage + IVR complaints
  const allComplaints = useMemo(() => {
    const ids = new Set(complaints.map((c) => c.id));
    const merged = [...complaints];
    for (const c of ivrComplaints) {
      if (!ids.has(c.id)) {
        merged.push(c);
        ids.add(c.id);
      }
    }
    return merged.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [complaints, ivrComplaints]);

  const stats = useMemo(() => {
    const all = allComplaints;
    const byStatus: Record<string, number> = {
      new: 0,
      acknowledged: 0,
      "in-progress": 0,
      resolved: 0,
      closed: 0,
    };
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const c of all) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byType[c.complaint_type] = (byType[c.complaint_type] || 0) + 1;
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
    }
    return { total: all.length, byStatus, byType, bySeverity };
  }, [allComplaints]);

  const filtered = useMemo(() => {
    let result = allComplaints;
    if (filterStatus) result = result.filter((c) => c.status === filterStatus);
    if (filterSeverity)
      result = result.filter((c) => c.severity === filterSeverity);
    if (filterType)
      result = result.filter((c) => c.complaint_type === filterType);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.citizen_name.toLowerCase().includes(q) ||
          c.district.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.location_description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allComplaints, filterStatus, filterSeverity, filterType, searchQuery]);

  const handleStatusUpdate = (id: string, status: ComplaintStatus) => {
    updateComplaintStatus(id, status, updateNotes || undefined);
    setComplaints(getAllComplaints());
    setUpdateNotes("");
    if (selectedComplaint?.id === id) {
      setSelectedComplaint(
        getAllComplaints().find((c) => c.id === id) || null
      );
    }
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const timeAgo = useCallback((iso: string) => {
    const diff = new Date().getTime() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <div className="space-y-5 relative">
      {/* ── Notification Toasts (fixed, top-right) ── */}
      <div className="fixed top-20 right-6 z-9998 space-y-3">
        {notifications.map((n) => (
          <NotificationToast
            key={n.id}
            notification={n}
            onDismiss={() => dismissNotification(n.id)}
            onClick={() => {
              dismissNotification(n.id);
              const found = allComplaints.find((c) => c.id === n.id);
              if (found) setSelectedComplaint(found);
            }}
          />
        ))}
      </div>

      {/* ── Live Activity Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Quick stat pills */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200/60 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-gray-900">
              {stats.byStatus.new}
            </span>
            <span className="text-[10px] text-gray-400">new</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200/60 shadow-sm">
            <Activity size={12} className="text-orange-500" />
            <span className="text-xs font-bold text-gray-900">
              {stats.byStatus["in-progress"]}
            </span>
            <span className="text-[10px] text-gray-400">active</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200/60 shadow-sm">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span className="text-xs font-bold text-gray-900">
              {stats.byStatus.resolved + stats.byStatus.closed}
            </span>
            <span className="text-[10px] text-gray-400">resolved</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <button
            onClick={() => setNotifCount(0)}
            className="relative p-2.5 rounded-xl bg-white border border-gray-200/60 shadow-sm hover:shadow-md transition-all"
          >
            {notifCount > 0 ? (
              <BellRing
                size={16}
                className="text-orange-500 animate-bounce"
              />
            ) : (
              <Bell size={16} className="text-gray-400" />
            )}
            {notifCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg shadow-red-500/30">
                {notifCount}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={() => {
              setComplaints(getAllComplaints());
              fetchIVRComplaints();
            }}
            className="p-2.5 rounded-xl bg-white border border-gray-200/60 shadow-sm hover:shadow-md text-gray-400 hover:text-orange-500 transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── Analytics Strip ── */}
      <div className="grid grid-cols-4 gap-3">
        {/* Total Reports */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-orange-500 to-orange-600 p-5 text-white shadow-lg shadow-orange-500/20">
          <div className="relative z-10">
            <p className="text-3xl font-extrabold">{stats.total}</p>
            <p className="text-orange-100 text-xs font-medium mt-1">
              Total Reports
            </p>
          </div>
          <Inbox
            size={52}
            className="absolute -bottom-1 -right-1 text-white/10"
            strokeWidth={1.5}
          />
        </div>

        {/* Severity */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-red-500 to-rose-600 p-5 text-white shadow-lg shadow-red-500/20">
          <div className="relative z-10">
            <p className="text-3xl font-extrabold">
              {(stats.bySeverity.critical || 0) + (stats.bySeverity.high || 0)}
            </p>
            <p className="text-red-100 text-xs font-medium mt-1">
              Critical / High
            </p>
            <div className="flex items-center gap-2 mt-2">
              {(["critical", "high", "medium", "low"] as ComplaintSeverity[]).map((s) => (
                <div key={s} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    s === "critical" ? "bg-yellow-300" : s === "high" ? "bg-orange-300" : s === "medium" ? "bg-red-200" : "bg-red-300/50"
                  }`} />
                  <span className="text-[10px] text-white/70 font-bold">{stats.bySeverity[s] || 0}</span>
                </div>
              ))}
            </div>
          </div>
          <Shield
            size={52}
            className="absolute -bottom-1 -right-1 text-white/10"
            strokeWidth={1.5}
          />
        </div>

        {/* Top Issues */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-violet-500 to-purple-600 p-5 text-white shadow-lg shadow-violet-500/20">
          <div className="relative z-10">
            {(() => {
              const sorted = Object.entries(stats.byType).sort(([, a], [, b]) => b - a);
              const top = sorted[0];
              const topType = top ? TYPE_CONFIG[top[0] as ComplaintType] : null;
              return (
                <>
                  <p className="text-3xl font-extrabold">{top ? top[1] : 0}</p>
                  <p className="text-violet-100 text-xs font-medium mt-1">
                    {topType ? `${topType.icon} ${topType.label}` : "No Issues"}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {sorted.slice(1, 4).map(([type, count]) => {
                      const tc = TYPE_CONFIG[type as ComplaintType];
                      if (!tc) return null;
                      return (
                        <span key={type} className="text-[10px] text-white/70 font-bold">
                          {tc.icon} {count}
                        </span>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
          <BarChart3
            size={52}
            className="absolute -bottom-1 -right-1 text-white/10"
            strokeWidth={1.5}
          />
        </div>

        {/* Live Feed */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-lg shadow-emerald-500/20">
          <div className="relative z-10">
            <p className="text-3xl font-extrabold">{ivrComplaints.length}</p>
            <p className="text-emerald-100 text-xs font-medium mt-1">
              IVR Calls Live
            </p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] text-white/70 font-bold">Feed active</span>
            </div>
          </div>
          <Radio
            size={52}
            className="absolute -bottom-1 -right-1 text-white/10"
            strokeWidth={1.5}
          />
        </div>
      </div>

      {/* ── Search + Filters ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, name, district, description..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200/60 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 transition placeholder:text-gray-300"
          />
        </div>

        {/* Filter chips */}
        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as ComplaintStatus | "")
          }
          className="px-3 py-2.5 text-xs bg-white border border-gray-200/60 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none cursor-pointer font-medium text-gray-600"
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([key, c]) => (
            <option key={key} value={key}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={filterSeverity}
          onChange={(e) =>
            setFilterSeverity(e.target.value as ComplaintSeverity | "")
          }
          className="px-3 py-2.5 text-xs bg-white border border-gray-200/60 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none cursor-pointer font-medium text-gray-600"
        >
          <option value="">All Severity</option>
          {Object.entries(SEVERITY_CONFIG).map(([key, c]) => (
            <option key={key} value={key}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) =>
            setFilterType(e.target.value as ComplaintType | "")
          }
          className="px-3 py-2.5 text-xs bg-white border border-gray-200/60 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none cursor-pointer font-medium text-gray-600"
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([key, c]) => (
            <option key={key} value={key}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>

        <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Complaint List + Detail ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* List */}
        <div className="lg:col-span-7 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200/60 p-16 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Inbox size={28} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">
                No complaints found
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try adjusting your filters or search query
              </p>
            </div>
          ) : (
            filtered.slice(0, 50).map((complaint, idx) => {
              const typeConf = TYPE_CONFIG[complaint.complaint_type];
              const sevConf = SEVERITY_CONFIG[complaint.severity];
              const statusConf = STATUS_CONFIG[complaint.status];
              const sourceConf = SOURCE_CONFIG[complaint.source] || {
                label: complaint.source,
                icon: "📨",
                accent: "text-gray-600",
              };
              const isSelected = selectedComplaint?.id === complaint.id;
              const isNew = complaint.status === "new";

              return (
                <div
                  key={complaint.id}
                  onClick={() => setSelectedComplaint(complaint)}
                  className={`relative group rounded-2xl border transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "bg-orange-50/50 border-orange-300 shadow-lg shadow-orange-500/10 ring-1 ring-orange-400/30"
                      : isNew
                        ? "bg-white border-gray-200/60 shadow-sm hover:shadow-md hover:border-orange-200 hover:-translate-y-0.5"
                        : "bg-white border-gray-200/60 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  }`}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  {/* New indicator strip */}
                  {isNew && (
                    <div className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-linear-to-b from-orange-400 to-red-500" />
                  )}

                  <div className="p-4 pl-5">
                    <div className="flex items-start gap-3.5">
                      {/* Type badge */}
                      <div
                        className={`w-11 h-11 rounded-xl bg-linear-to-br ${typeConf.gradient} flex items-center justify-center text-lg shadow-md shrink-0`}
                      >
                        {typeConf.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Top row: status + severity */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusConf.color}`}
                          >
                            {statusConf.icon}
                            {statusConf.label}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${sevConf.color} ring-1 ${sevConf.ring}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${sevConf.dot}`}
                            />
                            {sevConf.label}
                          </span>
                          <span
                            className={`text-[10px] font-medium ${sourceConf.accent} ml-auto`}
                          >
                            {sourceConf.icon} {sourceConf.label}
                          </span>
                        </div>

                        {/* Description */}
                        <p className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2">
                          {complaint.description}
                        </p>

                        {/* Photo Thumbnail */}
                        {complaint.photo_thumbnail && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={complaint.photo_thumbnail} alt="" className="w-full h-full object-cover" />
                            </div>
                            {complaint.ai_match_verdict && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                complaint.ai_match_verdict === "match"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : complaint.ai_match_verdict === "mismatch"
                                    ? "bg-red-50 text-red-700 border border-red-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}>
                                {complaint.ai_match_verdict === "match" ? "✓ AI Verified" :
                                 complaint.ai_match_verdict === "mismatch" ? "✗ Mismatch" : "~ Review"}
                                {complaint.ai_match_score != null && (
                                  <span className="ml-0.5 opacity-70">{complaint.ai_match_score}%</span>
                                )}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Bottom metadata */}
                        <div className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                            <MapPin
                              size={11}
                              className="text-gray-300"
                            />
                            {complaint.district}
                            {complaint.taluka
                              ? `, ${complaint.taluka}`
                              : ""}
                          </span>
                          {complaint.highway_ref && (
                            <span className="text-[10px] font-mono font-bold text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">
                              {complaint.highway_ref}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[11px] text-gray-400">
                            <Clock size={10} />{" "}
                            {timeAgo(complaint.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <ChevronRight
                        size={16}
                        className={`shrink-0 mt-3 transition-all ${isSelected ? "text-orange-400" : "text-gray-200 group-hover:text-gray-400"}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-5">
          {selectedComplaint ? (
            <ComplaintDetail
              complaint={selectedComplaint}
              onStatusUpdate={handleStatusUpdate}
              updateNotes={updateNotes}
              setUpdateNotes={setUpdateNotes}
              formatDateTime={formatDateTime}
              timeAgo={timeAgo}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center sticky top-35">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <Eye size={28} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-400">
                Select a complaint
              </p>
              <p className="text-xs text-gray-300 mt-1">
                Click any report to view full details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Complaint Detail Panel ──────────────────────────── */

function ComplaintDetail({
  complaint,
  onStatusUpdate,
  updateNotes,
  setUpdateNotes,
  formatDateTime,
  timeAgo,
}: {
  complaint: Complaint;
  onStatusUpdate: (id: string, status: ComplaintStatus) => void;
  updateNotes: string;
  setUpdateNotes: (v: string) => void;
  formatDateTime: (iso: string) => string;
  timeAgo: (iso: string) => string;
}) {
  const typeConf = TYPE_CONFIG[complaint.complaint_type];
  const sevConf = SEVERITY_CONFIG[complaint.severity];
  const statusConf = STATUS_CONFIG[complaint.status];
  const sourceConf = SOURCE_CONFIG[complaint.source] || {
    label: complaint.source,
    icon: "📨",
    accent: "text-gray-600",
  };

  const nextStatuses: ComplaintStatus[] = (() => {
    switch (complaint.status) {
      case "new":
        return ["acknowledged", "in-progress"];
      case "acknowledged":
        return ["in-progress", "closed"];
      case "in-progress":
        return ["resolved", "closed"];
      case "resolved":
        return ["closed"];
      default:
        return [];
    }
  })();

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden sticky top-35 shadow-sm animate-fade-in">
      {/* ── Gradient Header ── */}
      <div
        className={`bg-linear-to-br ${typeConf.gradient} p-5 relative overflow-hidden`}
      >
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl shadow-inner">
                {typeConf.icon}
              </div>
              <div>
                <h3 className="text-white font-bold text-base leading-tight">
                  {typeConf.label}
                </h3>
                <p className="text-white/70 text-[10px] font-mono font-bold mt-0.5">
                  {complaint.id}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white/20 backdrop-blur-sm text-white border border-white/20">
                {sevConf.label} Severity
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 text-white/60 text-[10px]">
            <span>
              {sourceConf.icon} {sourceConf.label}
            </span>
            <span>•</span>
            <span>{timeAgo(complaint.timestamp)}</span>
            <span>•</span>
            <span>{formatDateTime(complaint.timestamp)}</span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4 max-h-[58vh] overflow-y-auto">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${statusConf.color}`}
          >
            {statusConf.icon}
            {statusConf.label}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${sevConf.color} ring-1 ${sevConf.ring}`}
          >
            <span className={`w-2 h-2 rounded-full ${sevConf.dot}`} />
            {sevConf.label}
          </span>
        </div>

        {/* Photo Evidence — shown FIRST when available */}
        {complaint.photo_url && (
          <div className="rounded-xl bg-blue-50/70 border border-blue-200/50 overflow-hidden">
            <div className="p-4 pb-3">
              <label className="text-[10px] uppercase tracking-widest text-blue-500 font-bold flex items-center gap-1.5">
                <Camera size={10} /> Photo Evidence
              </label>
            </div>
            <div className="px-4 pb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={complaint.photo_url}
                alt="Road condition evidence"
                className="w-full rounded-lg border border-blue-200 shadow-sm max-h-[280px] object-cover"
              />
            </div>
            {complaint.ai_match_verdict && (
              <div className="mx-4 mb-4 p-3 rounded-lg bg-white/80 border border-blue-200/60">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-violet-500" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">AI Verification</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    complaint.ai_match_verdict === "match"
                      ? "bg-emerald-100 text-emerald-700"
                      : complaint.ai_match_verdict === "mismatch"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}>
                    {complaint.ai_match_verdict === "match" ? "✓ Verified" :
                     complaint.ai_match_verdict === "mismatch" ? "✗ Mismatch" : "~ Inconclusive"}
                    {complaint.ai_match_score != null && ` (${complaint.ai_match_score}%)`}
                  </span>
                </div>
                {complaint.ai_photo_analysis && (
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {complaint.ai_photo_analysis}
                  </p>
                )}
                {complaint.ai_match_score != null && (
                  <div className="mt-2">
                    <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          complaint.ai_match_score >= 70 ? "bg-emerald-500" :
                          complaint.ai_match_score >= 40 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${complaint.ai_match_score}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
            Description
          </label>
          <p className="text-sm text-gray-800 mt-1.5 leading-relaxed">
            {complaint.description}
          </p>
        </div>

        {/* Location card */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold flex items-center gap-1.5">
            <MapPin size={10} /> Location
          </label>
          <p className="text-sm text-gray-800 font-medium mt-1.5">
            {complaint.location_description}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
            <span className="font-medium">{complaint.district}</span>
            {complaint.taluka && (
              <>
                <span className="text-gray-300">•</span>
                <span>{complaint.taluka}</span>
              </>
            )}
            {complaint.highway_ref && (
              <span className="font-mono text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-bold text-gray-400">
                {complaint.highway_ref}
              </span>
            )}
          </div>
        </div>

        {/* Citizen */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold flex items-center gap-1.5">
            <User size={10} /> Citizen
          </label>
          <div className="flex items-center gap-4 mt-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <User size={14} className="text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {complaint.citizen_name}
                </p>
                <p className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Phone size={9} /> {complaint.citizen_phone}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Voice Transcript */}
        {complaint.voice_transcript && (
          <div className="rounded-xl bg-orange-50/70 border border-orange-200/50 p-4">
            <label className="text-[10px] uppercase tracking-widest text-orange-500 font-bold flex items-center gap-1.5">
              <Volume2 size={10} /> Voice Transcript
            </label>
            <p className="text-sm text-gray-700 mt-1.5 italic leading-relaxed">
              &ldquo;{complaint.voice_transcript}&rdquo;
            </p>
          </div>
        )}

        {/* Resolution */}
        {complaint.resolved_at && (
          <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/50 p-4">
            <label className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold flex items-center gap-1.5">
              <CheckCircle2 size={10} /> Resolution
            </label>
            <p className="text-sm text-gray-700 mt-1.5">
              Resolved on {formatDateTime(complaint.resolved_at)}
            </p>
            {complaint.resolution_notes && (
              <p className="text-xs text-gray-500 mt-1 italic">
                {complaint.resolution_notes}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        {nextStatuses.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
              Take Action
            </label>
            <textarea
              value={updateNotes}
              onChange={(e) => setUpdateNotes(e.target.value)}
              placeholder="Add notes (optional)..."
              className="w-full mt-2 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none transition"
              rows={2}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {nextStatuses.map((status) => {
                const conf = STATUS_CONFIG[status];
                return (
                  <button
                    key={status}
                    onClick={() =>
                      onStatusUpdate(complaint.id, status)
                    }
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:shadow-md active:scale-95 ${
                      status === "resolved"
                        ? "bg-emerald-500 text-white shadow-emerald-500/20"
                        : status === "in-progress"
                          ? "bg-orange-500 text-white shadow-orange-500/20"
                          : status === "acknowledged"
                            ? "bg-indigo-500 text-white shadow-indigo-500/20"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    {conf.icon}
                    Mark as {conf.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

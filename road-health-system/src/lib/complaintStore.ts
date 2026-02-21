/**
 * Complaint Store — localStorage-backed CRUD for citizen complaints.
 * Designed for a techathon demo; in production this would hit a real API/DB.
 */

import { Complaint, ComplaintType, ComplaintSeverity, ComplaintStatus } from "./types";

const STORAGE_KEY = "roadrakshak_complaints";

// ─── Helpers ─────────────────────────────────────────────────

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `CMP-${ts}-${rand}`.toUpperCase();
}

function readStore(): Complaint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStore(complaints: Complaint[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
}

// ─── CRUD Operations ─────────────────────────────────────────

export function getAllComplaints(): Complaint[] {
  return readStore().sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function getComplaintById(id: string): Complaint | undefined {
  return readStore().find((c) => c.id === id);
}

export function addComplaint(
  data: Omit<Complaint, "id" | "timestamp" | "status">
): Complaint {
  const complaint: Complaint = {
    ...data,
    id: generateId(),
    timestamp: new Date().toISOString(),
    status: "new",
  };
  const all = readStore();
  all.push(complaint);
  writeStore(all);
  return complaint;
}

export function updateComplaintStatus(
  id: string,
  status: ComplaintStatus,
  notes?: string
): Complaint | null {
  const all = readStore();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  all[idx].status = status;
  if (notes) all[idx].resolution_notes = notes;
  if (status === "resolved" || status === "closed") {
    all[idx].resolved_at = new Date().toISOString();
  }
  writeStore(all);
  return all[idx];
}

export function deleteComplaint(id: string): boolean {
  const all = readStore();
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) return false;
  writeStore(filtered);
  return true;
}

// ─── Analytics ───────────────────────────────────────────────

export function getComplaintStats() {
  const all = readStore();
  const total = all.length;
  const byStatus: Record<ComplaintStatus, number> = {
    new: 0,
    acknowledged: 0,
    "in-progress": 0,
    resolved: 0,
    closed: 0,
  };
  const byType: Record<ComplaintType, number> = {
    pothole: 0,
    crack: 0,
    waterlogging: 0,
    debris: 0,
    missing_signage: 0,
    guardrail_damage: 0,
    road_collapse: 0,
    other: 0,
  };
  const bySeverity: Record<ComplaintSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const byDistrict: Record<string, number> = {};

  all.forEach((c) => {
    byStatus[c.status]++;
    byType[c.complaint_type]++;
    bySeverity[c.severity]++;
    byDistrict[c.district] = (byDistrict[c.district] || 0) + 1;
  });

  // Avg resolution time (for resolved/closed)
  const resolved = all.filter((c) => c.resolved_at);
  let avgResolutionHrs = 0;
  if (resolved.length > 0) {
    const totalHrs = resolved.reduce((sum, c) => {
      const start = new Date(c.timestamp).getTime();
      const end = new Date(c.resolved_at!).getTime();
      return sum + (end - start) / (1000 * 60 * 60);
    }, 0);
    avgResolutionHrs = Math.round(totalHrs / resolved.length);
  }

  return { total, byStatus, byType, bySeverity, byDistrict, avgResolutionHrs };
}

// ─── Seed Demo Data (4 realistic, varied complaints) ─────────

export function seedDemoComplaints(_count?: number) {
  const existing = readStore();
  // If any user-submitted complaints exist (non-demo IDs), always preserve
  const hasUserData = existing.some((c) => !c.id.startsWith("CMP-RR-"));
  if (hasUserData) {
    // Ensure demo data is present alongside user data
    const demoIds = new Set(existing.filter((c) => c.id.startsWith("CMP-RR-")).map((c) => c.id));
    if (demoIds.size >= 4) return existing; // all demos present
    // Otherwise fall through to add missing demos (handled below)
  }
  // Keep if the data matches our curated set
  if (existing.length > 0 && existing.length <= 10) return existing;
  // Clear stale data from previous bulk seeds (only if no user data)
  if (existing.length > 10 && !hasUserData) writeStore([]);

  const now = Date.now();
  const complaints: Complaint[] = [
    {
      id: "CMP-RR-001",
      timestamp: new Date(now - 2 * 3600000).toISOString(), // 2h ago
      district: "Pune",
      taluka: "Maval",
      location_description: "NH-48 near Lonavala toll naka, before Khandala ghat section",
      highway_ref: "NH-48",
      complaint_type: "pothole",
      severity: "critical",
      description: "Deep potholes on NH-48 near Lonavala — 3-4 feet deep, two accidents in last week. Extremely dangerous at night with no reflectors.",
      citizen_name: "Rajesh Patil",
      citizen_phone: "+91 9822045678",
      source: "ivr_voice",
      status: "new",
      voice_transcript: "NH-48 pe Lonavala ke paas bahut bade gadde hain, 3-4 feet gahre, 2 accident ho chuke hain, raat mein bahut khatarnak hai",
    },
    {
      id: "CMP-RR-002",
      timestamp: new Date(now - 6 * 3600000).toISOString(), // 6h ago
      district: "Thane",
      taluka: "Shahapur",
      location_description: "SH-35 Shahapur-Murbad road, near Tansa wildlife sanctuary gate",
      highway_ref: "SH-35",
      complaint_type: "road_collapse",
      severity: "high",
      description: "Road shoulder collapsed after heavy monsoon rains near Tansa sanctuary. Only one lane passable. Heavy vehicles taking detour.",
      citizen_name: "Kavita Londhe",
      citizen_phone: "+91 8879123456",
      source: "web_form",
      status: "acknowledged",
    },
    {
      id: "CMP-RR-003",
      timestamp: new Date(now - 18 * 3600000).toISOString(), // 18h ago
      district: "Nashik",
      taluka: "Igatpuri",
      location_description: "Mumbai-Agra highway, Kasara ghat section km 120-122",
      highway_ref: "NH-160",
      complaint_type: "guardrail_damage",
      severity: "critical",
      description: "Guardrail completely destroyed after truck accident on Kasara ghat. Cliff edge exposed with 200m drop. No temporary barriers placed.",
      citizen_name: "Amol Jadhav",
      citizen_phone: "+91 7588903456",
      source: "ivr_voice",
      status: "in-progress",
      voice_transcript: "Kasara ghat pe guardrail toot gayi hai, truck ka accident hua tha, 200 meter ki khai hai, koi barrier nahi lagaya",
      assigned_to: "PWD Nashik Division",
    },
    {
      id: "CMP-RR-004",
      timestamp: new Date(now - 48 * 3600000).toISOString(), // 2 days ago
      district: "Satara",
      taluka: "Mahabaleshwar",
      location_description: "Poladpur-Mahabaleshwar road, near Amba ghat viewpoint",
      highway_ref: "SH-72",
      complaint_type: "waterlogging",
      severity: "medium",
      description: "Persistent waterlogging at Amba ghat curve — drainage system blocked by landslide debris. Water stands 1-2 feet during rains.",
      citizen_name: "Sunita Deshpande",
      citizen_phone: "+91 9405567890",
      source: "telegram",
      status: "resolved",
      resolved_at: new Date(now - 12 * 3600000).toISOString(),
      resolution_notes: "Drainage cleared by Satara PWD team. Debris removed and channel restored.",
    },
  ];

  writeStore(complaints);
  return complaints;
}

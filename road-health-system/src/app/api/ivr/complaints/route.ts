/**
 * GET /api/ivr/complaints
 * 
 * Returns all IVR complaints from the in-memory store.
 * The dashboard polls this endpoint.
 */
import { NextResponse } from "next/server";
import { getIVRComplaints } from "../process-recording/route";

export async function GET() {
  const complaints = getIVRComplaints().sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Compute quick stats
  const total = complaints.length;
  const byStatus = { new: 0, acknowledged: 0, "in-progress": 0, resolved: 0, closed: 0 };
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byDivision: Record<string, number> = {};
  const byDistrict: Record<string, number> = {};

  complaints.forEach((c) => {
    byStatus[c.status as keyof typeof byStatus]++;
    byType[c.complaint_type] = (byType[c.complaint_type] || 0) + 1;
    bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
    byDivision[c.division] = (byDivision[c.division] || 0) + 1;
    byDistrict[c.district] = (byDistrict[c.district] || 0) + 1;
  });

  return NextResponse.json({
    total,
    stats: { byStatus, byType, bySeverity, byDivision, byDistrict },
    complaints,
  });
}

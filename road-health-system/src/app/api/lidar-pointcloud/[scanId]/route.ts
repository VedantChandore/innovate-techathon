/**
 * GET /api/lidar-pointcloud/[scanId]
 * Proxy to backend to stream .laz point cloud file (binary).
 */
import { NextRequest, NextResponse } from "next/server";

const LIDAR_API = process.env.LIDAR_API_URL || "http://localhost:8001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  if (!scanId) {
    return NextResponse.json({ detail: "scanId required" }, { status: 400 });
  }
  const url = `${LIDAR_API}/lidar/pointcloud/${encodeURIComponent(scanId)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { detail: text || "Point cloud not found" },
        { status: res.status }
      );
    }
    const blob = await res.blob();
    const filename = res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ?? `${scanId}.laz`;
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "LiDAR API unavailable" },
      { status: 503 }
    );
  }
}

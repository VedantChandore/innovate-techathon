/**
 * Proxy to LiDAR backend - allows frontend to call /api/lidar/* when backend is on same host
 */
import { NextRequest, NextResponse } from "next/server";

const LIDAR_API = process.env.LIDAR_API_URL || "http://localhost:8001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const url = new URL(`/lidar/${pathStr}${request.nextUrl.search}`, LIDAR_API);
  try {
    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { detail: "LiDAR API unavailable" },
      { status: 503 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const url = new URL(`/lidar/${pathStr}`, LIDAR_API);
  try {
    const body = await request.text();
    const headers = new Headers();
    request.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "host") headers.set(k, v);
    });
    const res = await fetch(url.toString(), {
      method: "POST",
      body: body || undefined,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { detail: "LiDAR API unavailable" },
      { status: 503 }
    );
  }
}

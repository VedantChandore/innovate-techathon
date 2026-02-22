/**
 * Proxy to full LiDAR backend (dashboard, budget, workorders, upload)
 */
import { NextRequest, NextResponse } from "next/server";

const LIDAR_API = process.env.LIDAR_API_URL || "http://localhost:8001";

async function proxy(
  request: NextRequest,
  pathSegments: string[],
  method: "GET" | "POST"
) {
  const pathStr = pathSegments.length ? pathSegments.join("/") : "";
  const url = new URL(`/${pathStr}${request.nextUrl.search}`, LIDAR_API);
  try {
    const headers = new Headers();
    request.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "host") headers.set(k, v);
    });
    const res = await fetch(url.toString(), {
      method,
      body: method === "POST" ? await request.text() : undefined,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "LiDAR API unavailable" }, { status: 503 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params;
  return proxy(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params;
  return proxy(request, path, "POST");
}

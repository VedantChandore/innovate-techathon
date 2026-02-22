"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getPointCloudDownloadUrl } from "@/lib/lidarApi";

const PotreeViewer = dynamic(
  () => import("@/components/PotreeViewer"),
  { ssr: false }
);

export default function ViewerPage() {
  const params = useParams();
  const scanId = typeof params.scanId === "string" ? params.scanId : null;

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      <div className="shrink-0 px-4 py-2 bg-gray-800 text-white text-sm font-mono flex items-center justify-between">
        <span>LiDAR 3D Viewer {scanId ? `— Scan: ${scanId}` : ""}</span>
        <div className="flex items-center gap-3">
          {scanId && (
            <a
              href={getPointCloudDownloadUrl(scanId)}
              download={`${scanId}.laz`}
              className="text-amber-300 hover:text-amber-200"
            >
              Download .laz
            </a>
          )}
          <a href="/" className="text-blue-400 hover:text-blue-300">
            ← Back
          </a>
        </div>
      </div>
      <div className="flex-1 min-h-0 w-full">
        <PotreeViewer scanId={scanId ?? undefined} className="w-full h-full" />
      </div>
    </div>
  );
}

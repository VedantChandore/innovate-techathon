"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { getPointCloudDownloadUrl } from "@/lib/lidarApi";

interface PotreeViewerProps {
  scanId?: string;
  className?: string;
  height?: number;
}

/**
 * LiDAR Point Cloud 3D Viewer – high-detail procedural road
 * Potholes, longitudinal/transverse cracks, alligator cracking, edge cracks, ruts, raveling.
 */
function RoadPointCloud() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 95000;
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const roadW = 8;
    const roadL = 50;
    const crackDepth = 0.055;
    const crackWidth = 0.08;
    let idx = 0;

    // --- Potholes: varied sizes, depths, some oval ---
    const potholes: { cx: number; cz: number; rx: number; rz: number; depth: number }[] = [
      { cx: 1.2, cz: 5, rx: 1.4, rz: 1.2, depth: 0.24 },
      { cx: -1.8, cz: -8, rx: 1.0, rz: 1.3, depth: 0.2 },
      { cx: 0.5, cz: -15, rx: 1.9, rz: 1.5, depth: 0.3 },
      { cx: -2, cz: 12, rx: 0.85, rz: 0.9, depth: 0.14 },
      { cx: 2.2, cz: -3, rx: 1.0, rz: 0.8, depth: 0.16 },
      { cx: -0.8, cz: -20, rx: 0.7, rz: 1.1, depth: 0.12 },
      { cx: 1.8, cz: 18, rx: 1.2, rz: 1.0, depth: 0.18 },
      { cx: -2.5, cz: 0, rx: 0.6, rz: 0.6, depth: 0.1 },
      { cx: 0, cz: -5, rx: 1.1, rz: 0.9, depth: 0.2 },
    ];
    const potholeY = (x: number, z: number) => {
      let y = 0;
      for (const p of potholes) {
        const dx = (x - p.cx) / p.rx, dz = (z - p.cz) / p.rz;
        const d2 = dx * dx + dz * dz;
        y -= p.depth * Math.exp(-d2 * 2.2);
      }
      return y;
    };

    // --- Longitudinal cracks (more, finer wobble) ---
    const longCracks: { z0: number; z1: number; x: number; wobble: number; depth: number }[] = [
      { z0: -23, z1: 23, x: 0, wobble: 0.35, depth: 1 },
      { z0: -20, z1: 20, x: -2.6, wobble: 0.28, depth: 0.9 },
      { z0: -14, z1: 10, x: 2.3, wobble: 0.3, depth: 0.85 },
      { z0: -18, z1: 18, x: -1.2, wobble: 0.15, depth: 0.7 },
      { z0: -10, z1: 16, x: 1.5, wobble: 0.2, depth: 0.75 },
      { z0: -22, z1: 0, x: 3.2, wobble: 0.25, depth: 0.65 },
      { z0: 5, z1: 22, x: -3.3, wobble: 0.2, depth: 0.6 },
    ];
    // --- Transverse cracks ---
    const transCracks: { x0: number; x1: number; z: number; wobble: number; depth: number }[] = [
      { x0: -3.2, x1: 3.2, z: -10, wobble: 0.2, depth: 0.9 },
      { x0: -2.8, x1: 2.8, z: 14, wobble: 0.18, depth: 0.85 },
      { x0: -3, x1: 3, z: -18, wobble: 0.25, depth: 0.8 },
      { x0: -2.5, x1: 2.5, z: 2, wobble: 0.12, depth: 0.7 },
      { x0: -3, x1: 3, z: 20, wobble: 0.22, depth: 0.75 },
      { x0: -2, x1: 2, z: -5, wobble: 0.1, depth: 0.6 },
    ];
    const lineCrackY = (x: number, z: number) => {
      let y = 0;
      for (const c of longCracks) {
        const t = (z - c.z0) / (c.z1 - c.z0);
        if (t < 0 || t > 1) continue;
        const cx = c.x + c.wobble * Math.sin(z * 2.5);
        const dist = Math.abs(x - cx);
        y -= crackDepth * c.depth * Math.exp(-(dist * dist) / (crackWidth * crackWidth));
      }
      for (const c of transCracks) {
        const t = (x - c.x0) / (c.x1 - c.x0);
        if (t < 0 || t > 1) continue;
        const cz = c.z + c.wobble * Math.sin(x * 2.5);
        const dist = Math.abs(z - cz);
        y -= crackDepth * 0.85 * c.depth * Math.exp(-(dist * dist) / (crackWidth * crackWidth));
      }
      return y;
    };

    // --- Edge cracks (narrow, along road edges) ---
    const edgeCrackY = (x: number, z: number) => {
      const w = 0.06;
      let y = 0;
      const distL = Math.abs(x + roadW / 2);
      const distR = Math.abs(x - roadW / 2);
      if (distL < 0.4 && z > -20 && z < 20) y -= crackDepth * 0.7 * Math.exp(-(distL * distL) / (w * w));
      if (distR < 0.4 && z > -20 && z < 20) y -= crackDepth * 0.7 * Math.exp(-(distR * distR) / (w * w));
      return y;
    };

    // --- Alligator (fatigue) cracking: patch with grid of small cracks ---
    const alligatorZone = { x0: -2.2, x1: 0.5, z0: 8, z1: 17 };
    const alligatorY = (x: number, z: number) => {
      if (x < alligatorZone.x0 || x > alligatorZone.x1 || z < alligatorZone.z0 || z > alligatorZone.z1) return 0;
      const step = 0.7;
      const nx = (x - alligatorZone.x0) / step;
      const nz = (z - alligatorZone.z0) / step;
      const fx = nx - Math.floor(nx);
      const fz = nz - Math.floor(nz);
      const distToLine = Math.min(fx, 1 - fx, fz, 1 - fz) * step;
      const w = 0.06;
      return -crackDepth * 0.9 * Math.exp(-(distToLine * distToLine) / (w * w));
    };

    // --- Block cracking: another patch with rectangular pattern ---
    const blockZone = { x0: 1.5, x1: 3.5, z0: -12, z1: -5 };
    const blockY = (x: number, z: number) => {
      if (x < blockZone.x0 || x > blockZone.x1 || z < blockZone.z0 || z > blockZone.z1) return 0;
      const stepX = 0.9, stepZ = 0.6;
      const nx = (x - blockZone.x0) / stepX;
      const nz = (z - blockZone.z0) / stepZ;
      const fx = nx - Math.floor(nx);
      const fz = nz - Math.floor(nz);
      const distToEdge = Math.min(fx, 1 - fx, fz, 1 - fz) * Math.min(stepX, stepZ);
      const w = 0.05;
      return -crackDepth * 0.65 * Math.exp(-(distToEdge * distToEdge) / (w * w));
    };

    // --- Ruts (wheel path depressions) ---
    const rutY = (x: number) => {
      const rutDepth = 0.035;
      const rutWidth = 0.25;
      const left = -1.3, right = 1.3;
      let y = 0;
      y -= rutDepth * Math.exp(-((x - left) ** 2) / (rutWidth * rutWidth));
      y -= rutDepth * Math.exp(-((x - right) ** 2) / (rutWidth * rutWidth));
      return y;
    };

    // --- Raveling: fine surface roughness ---
    const ravel = (x: number, z: number) =>
      0.006 * (Math.sin(x * 20) * Math.cos(z * 18) + Math.sin(z * 15) * 0.5);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * roadW;
      const z = (Math.random() - 0.5) * roadL;
      const baseY = -0.02 * (x * x) + Math.random() * 0.006;
      const y =
        baseY +
        potholeY(x, z) +
        lineCrackY(x, z) +
        edgeCrackY(x, z) +
        alligatorY(x, z) +
        blockY(x, z) +
        rutY(x) +
        ravel(x, z);
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      const depth = Math.max(0, -y);
      let r: number, g: number, b: number;
      if (depth > 0.22) {
        r = 0.72; g = 0.12; b = 0.08;
      } else if (depth > 0.1) {
        r = 0.82; g = 0.38; b = 0.08;
      } else if (depth > 0.05) {
        r = 0.78; g = 0.48; b = 0.12;
      } else if (depth > 0.025) {
        r = 0.65; g = 0.5; b = 0.25;
      } else if (depth > 0.01) {
        r = 0.45; g = 0.45; b = 0.38;
      } else {
        r = 0.32; g = 0.38; b = 0.34;
      }
      colors[idx * 3] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = b;
      idx++;
    }

    return { positions, colors };
  }, []);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        size={0.042}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.9}
      />
    </points>
  );
}

export default function PotreeViewer({ scanId, className = "", height }: PotreeViewerProps) {
  const style: React.CSSProperties = {
    background: "#1a1a2e",
    borderRadius: 8,
    overflow: "hidden",
    minHeight: 200,
    height: height ?? "100%",
  };
  const downloadUrl = scanId ? getPointCloudDownloadUrl(scanId) : null;
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      {downloadUrl && (
        <a
          href={downloadUrl}
          download={`${scanId}.laz`}
          className="absolute bottom-2 right-2 z-10 rounded bg-gray-800/90 px-2 py-1 text-xs text-white hover:bg-gray-700"
        >
          Download .laz
        </a>
      )}
      <Canvas
        camera={{ position: [0, 2, 20], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#1a1a2e"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <directionalLight position={[-10, 5, -5]} intensity={0.5} />
        <Suspense fallback={null}>
          <RoadPointCloud />
        </Suspense>
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={3}
          maxDistance={80}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
        <gridHelper args={[30, 30, "#333", "#222"]} position={[0, -0.2, 0]} />
      </Canvas>
    </div>
  );
}

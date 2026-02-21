"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera,
  Upload,
  X,
  MapPin,
  User,
  Phone,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Image as ImageIcon,
  Shield,
  Sparkles,
  ChevronDown,
  Send,
  RefreshCw,
  Edit3,
} from "lucide-react";
import { ComplaintType, ComplaintSeverity } from "@/lib/types";
import { addComplaint } from "@/lib/complaintStore";

/* ─── Constants ──────────────────────────────────────── */

const DISTRICTS = [
  "Pune", "Mumbai", "Nashik", "Nagpur", "Satara",
  "Kolhapur", "Thane", "Raigad", "Ahmednagar",
  "Solapur", "Sangli", "Aurangabad",
];

const TYPE_META: Record<string, { label: string; icon: string }> = {
  pothole: { label: "Pothole", icon: "🕳️" },
  crack: { label: "Road Crack", icon: "⚡" },
  waterlogging: { label: "Waterlogging", icon: "🌊" },
  debris: { label: "Debris on Road", icon: "🪨" },
  missing_signage: { label: "Missing Signage", icon: "🚧" },
  guardrail_damage: { label: "Guardrail Damage", icon: "🛡️" },
  road_collapse: { label: "Road Collapse", icon: "💥" },
  other: { label: "Other", icon: "📋" },
};

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  medium: { label: "Medium", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  high: { label: "High", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  critical: { label: "Critical", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

interface PhotoComplaintProps {
  onComplaintSubmitted?: () => void;
}

type AnalysisResult = {
  ai_photo_analysis: string;
  ai_generated_description?: string;
  ai_match_score: number;
  ai_match_verdict: "match" | "mismatch" | "inconclusive";
  ai_suggested_type?: string;
  ai_suggested_severity?: string;
  is_road_photo?: boolean;
};

/* ─── Component ──────────────────────────────────────── */

export default function PhotoComplaint({ onComplaintSubmitted }: PhotoComplaintProps) {
  // Form state
  const [citizenName, setCitizenName] = useState("");
  const [citizenPhone, setCitizenPhone] = useState("");
  const [district, setDistrict] = useState("");
  const [location, setLocation] = useState("");
  const [highwayRef, setHighwayRef] = useState("");

  // AI-filled fields (user can override)
  const [complaintType, setComplaintType] = useState<ComplaintType | "">("");
  const [severity, setSeverity] = useState<ComplaintSeverity | "">("");
  const [description, setDescription] = useState("");
  const [editingAiFields, setEditingAiFields] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // AI analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ─── Photo Handling ─────────────────────────────────

  const processImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setPhotoFile(file);
    setAnalysisResult(null);
    setAnalysisError(null);
    setComplaintType("");
    setSeverity("");
    setDescription("");
    setEditingAiFields(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        setPhotoPreview(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processImage(file);
  }, [processImage]);

  const removePhoto = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setComplaintType("");
    setSeverity("");
    setDescription("");
    setEditingAiFields(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  // ─── Auto AI Analysis (triggered when photo is ready) ──

  const analyzePhoto = useCallback(async (imageData: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/verify-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageData, mode: "analyze" }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data: AnalysisResult = await res.json();
      setAnalysisResult(data);

      // Auto-fill form fields from AI
      if (data.ai_suggested_type) {
        setComplaintType(data.ai_suggested_type as ComplaintType);
      }
      if (data.ai_suggested_severity) {
        setSeverity(data.ai_suggested_severity as ComplaintSeverity);
      }
      if (data.ai_generated_description) {
        setDescription(data.ai_generated_description);
      }
    } catch (err) {
      console.error("Photo analysis failed:", err);
      setAnalysisError("AI analysis failed. You can fill in the details manually.");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Auto-trigger analysis when photoPreview changes
  useEffect(() => {
    if (photoPreview) {
      analyzePhoto(photoPreview);
    }
  }, [photoPreview, analyzePhoto]);

  const retryAnalysis = () => {
    if (photoPreview) analyzePhoto(photoPreview);
  };

  // ─── Submit ─────────────────────────────────────────

  const handleSubmit = async () => {
    if (!complaintType || !severity || !description || !district || !citizenName || !citizenPhone) return;
    setIsSubmitting(true);

    try {
      // Create thumbnail
      let thumbnail: string | undefined;
      if (photoPreview) {
        const img = new window.Image();
        await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = photoPreview; });
        const canvas = document.createElement("canvas");
        const TH = 200;
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * TH / w); w = TH; } else { w = Math.round(w * TH / h); h = TH; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        thumbnail = canvas.toDataURL("image/jpeg", 0.6);
      }

      const result = addComplaint({
        citizen_name: citizenName,
        citizen_phone: citizenPhone,
        district,
        location_description: location,
        highway_ref: highwayRef || undefined,
        complaint_type: complaintType,
        severity,
        description,
        source: "photo_upload",
        photo_url: photoPreview || undefined,
        photo_thumbnail: thumbnail,
        ai_photo_analysis: analysisResult?.ai_photo_analysis,
        ai_match_score: analysisResult?.ai_match_score,
        ai_match_verdict: analysisResult?.ai_match_verdict,
      });

      setSubmittedId(result.id);
      setSubmitted(true);
      onComplaintSubmitted?.();
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCitizenName(""); setCitizenPhone(""); setDistrict(""); setLocation("");
    setHighwayRef(""); setComplaintType(""); setSeverity(""); setDescription("");
    removePhoto(); setSubmitted(false); setSubmittedId(null);
  };

  const canSubmit = !!complaintType && !!severity && !!description && !!district && !!citizenName && !!citizenPhone && !!photoPreview;
  const isNotRoad = analysisResult?.is_road_photo === false;

  // ─── Success State ──────────────────────────────────

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="bg-linear-to-br from-emerald-500 to-teal-600 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Complaint Submitted!</h2>
            <p className="text-emerald-100 text-sm mt-2">AI-verified photo complaint registered</p>
          </div>
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-6">
              <span className="text-sm text-emerald-600 font-medium">Complaint ID:</span>
              <span className="text-lg font-bold text-emerald-700 font-mono">{submittedId}</span>
            </div>
            {analysisResult && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-orange-500" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">AI Analysis</span>
                </div>
                <p className="text-xs text-gray-600 mb-2">{analysisResult.ai_photo_analysis}</p>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                    Confidence: {analysisResult.ai_match_score}%
                  </span>
                </div>
              </div>
            )}
            <button onClick={resetForm}
              className="px-6 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-all hover:shadow-lg active:scale-95">
              Submit Another Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Form ──────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-linear-to-br from-orange-500 to-orange-700 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Camera size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white">AI Photo Report</h2>
              <p className="text-[11px] text-orange-200">Upload a photo — AI auto-detects the issue, type & severity</p>
            </div>
          </div>
          {/* Progress: 3 steps now */}
          <div className="flex items-center gap-2 mt-4">
            {[
              { label: "Photo + AI", filled: !!analysisResult },
              { label: "Your Info", filled: !!(citizenName && citizenPhone) },
              { label: "Location", filled: !!district },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-1.5 flex-1">
                <div className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center transition-all ${
                  step.filled ? "bg-white text-orange-700" : "bg-white/25 text-white/60"
                }`}>{i + 1}</div>
                <span className={`text-[10px] font-medium ${step.filled ? "text-white" : "text-white/50"}`}>{step.label}</span>
                {i < 2 && <div className={`flex-1 h-px ${step.filled ? "bg-white/50" : "bg-white/15"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-gray-100">

          {/* ── Section 1: Photo Upload ── */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold flex items-center justify-center">1</span>
              <h3 className="text-[13px] font-bold text-gray-900">Upload Road Photo</h3>
              <span className="text-[10px] text-gray-400 ml-auto">AI will auto-analyze</span>
            </div>

            {!photoPreview ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-orange-300 hover:bg-orange-50/30 transition-all cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2.5 group-hover:bg-orange-100 transition-colors">
                  <Upload size={22} className="text-gray-400 group-hover:text-orange-500 transition-colors" />
                </div>
                <p className="text-sm font-semibold text-gray-600">Drop photo here or click to upload</p>
                <p className="text-[11px] text-gray-400 mt-1">JPG, PNG, HEIC up to 10MB</p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition flex items-center gap-1.5 shadow-sm">
                    <Upload size={12} /> Browse
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                    className="px-4 py-2 rounded-lg bg-linear-to-br from-orange-500 to-orange-600 text-xs font-bold text-white hover:shadow-lg transition flex items-center gap-1.5 shadow-sm">
                    <Camera size={12} /> Camera
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Photo preview */}
                <div className="relative rounded-xl overflow-hidden group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Road condition" className="w-full h-auto rounded-xl object-cover max-h-[260px]" />
                  <button onClick={removePhoto}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                    <X size={16} />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium flex items-center gap-1.5">
                    <ImageIcon size={10} /> {photoFile?.name || "Photo uploaded"}
                  </div>
                </div>

                {/* AI Analysis Status */}
                {isAnalyzing && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 border border-orange-200">
                    <Loader2 size={20} className="text-orange-500 animate-spin shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Gemini is analyzing your photo&hellip;</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Detecting issue type, severity, and generating description</p>
                    </div>
                  </div>
                )}

                {analysisError && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                    <XCircle size={18} className="text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-red-700">{analysisError}</p>
                    </div>
                    <button onClick={retryAnalysis} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-100 text-red-600 hover:bg-red-200 transition flex items-center gap-1">
                      <RefreshCw size={10} /> Retry
                    </button>
                  </div>
                )}

                {/* Not a road photo warning */}
                {isNotRoad && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                    <AlertTriangle size={16} className="text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">
                      <strong>This doesn&apos;t appear to be a road photo.</strong> Please upload a clear photo of the road condition.
                    </p>
                  </div>
                )}

                {/* AI Results — auto-filled fields */}
                {analysisResult && !isNotRoad && (
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-orange-500" />
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">AI Analysis Result</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          analysisResult.ai_match_score >= 70 ? "bg-emerald-100 text-emerald-700" :
                          analysisResult.ai_match_score >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}>
                          {analysisResult.ai_match_score}% confident
                        </span>
                        <button onClick={() => setEditingAiFields(!editingAiFields)}
                          className="text-[10px] text-orange-600 font-medium hover:underline flex items-center gap-0.5">
                          <Edit3 size={9} /> {editingAiFields ? "Done" : "Edit"}
                        </button>
                      </div>
                    </div>

                    {/* AI summary */}
                    <p className="text-xs text-gray-600 leading-relaxed">{analysisResult.ai_photo_analysis}</p>

                    {/* Detected type + severity pills */}
                    {!editingAiFields ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {complaintType && TYPE_META[complaintType] && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-700">
                            <span>{TYPE_META[complaintType].icon}</span>
                            {TYPE_META[complaintType].label}
                          </span>
                        )}
                        {severity && SEVERITY_META[severity] && (
                          <span className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${SEVERITY_META[severity].bg} ${SEVERITY_META[severity].color}`}>
                            {SEVERITY_META[severity].label} Severity
                          </span>
                        )}
                      </div>
                    ) : (
                      /* Editable type + severity */
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Issue Type</label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {Object.entries(TYPE_META).map(([key, meta]) => (
                              <button key={key} type="button" onClick={() => setComplaintType(key as ComplaintType)}
                                className={`flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-lg border text-center transition-all ${
                                  complaintType === key
                                    ? "bg-orange-50 border-orange-300 ring-1 ring-orange-400/30"
                                    : "bg-white border-gray-200 hover:bg-gray-50"
                                }`}>
                                <span className="text-sm">{meta.icon}</span>
                                <span className={`text-[8px] font-bold leading-tight ${complaintType === key ? "text-orange-700" : "text-gray-500"}`}>{meta.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Severity</label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {Object.entries(SEVERITY_META).map(([key, meta]) => (
                              <button key={key} type="button" onClick={() => setSeverity(key as ComplaintSeverity)}
                                className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                                  severity === key ? `${meta.bg} ring-1 ring-current/20 ${meta.color}` : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"
                                }`}>
                                {meta.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Generated description (always editable) */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                        <FileText size={9} /> AI-Generated Description
                        <span className="text-gray-300 font-normal ml-1">(editable)</span>
                      </label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none transition"
                        rows={3} />
                    </div>

                    {/* Re-analyze button */}
                    <button onClick={retryAnalysis} disabled={isAnalyzing}
                      className="text-[10px] text-orange-600 font-medium hover:underline flex items-center gap-1">
                      <RefreshCw size={9} /> Re-analyze photo
                    </button>
                  </div>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
          </div>

          {/* ── Section 2: Personal Info ── */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold flex items-center justify-center">2</span>
              <h3 className="text-[13px] font-bold text-gray-900">Your Information</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <User size={10} /> Full Name <span className="text-red-400">*</span>
                </label>
                <input type="text" value={citizenName} onChange={(e) => setCitizenName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 transition" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Phone size={10} /> Phone <span className="text-red-400">*</span>
                </label>
                <input type="tel" value={citizenPhone} onChange={(e) => setCitizenPhone(e.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 transition" />
              </div>
            </div>
          </div>

          {/* ── Section 3: Location ── */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold flex items-center justify-center">3</span>
              <h3 className="text-[13px] font-bold text-gray-900">Location Details</h3>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <MapPin size={10} /> District <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select value={district} onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none cursor-pointer">
                      <option value="">Select district</option>
                      {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Highway / Road Ref</label>
                  <input type="text" value={highwayRef} onChange={(e) => setHighwayRef(e.target.value)}
                    placeholder="e.g. NH-48, SH-35"
                    className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 transition" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                  Exact Location / Landmark
                </label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Near Lonavala toll naka, before Khandala ghat"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 transition" />
              </div>
            </div>
          </div>

          {/* ── Submit ── */}
          <div className="p-5 bg-gray-50/50">
            <button onClick={handleSubmit} disabled={!canSubmit || isSubmitting || isAnalyzing}
              className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                canSubmit && !isSubmitting && !isAnalyzing
                  ? "bg-linear-to-br from-orange-500 to-orange-600 text-white hover:shadow-xl hover:shadow-orange-500/25 active:scale-[0.98]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}>
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Submitting&hellip;</>
              ) : isAnalyzing ? (
                <><Loader2 size={16} className="animate-spin" /> Waiting for AI analysis&hellip;</>
              ) : (
                <>
                  <Send size={16} /> Submit Photo Complaint
                  {analysisResult && analysisResult.ai_match_score >= 70 && (
                    <CheckCircle2 size={14} className="text-emerald-200" />
                  )}
                </>
              )}
            </button>
            {!canSubmit && !isAnalyzing && (
              <p className="text-[10px] text-gray-400 text-center mt-2">
                {!photoPreview ? "Upload a photo to get started — AI fills in the rest" :
                 !analysisResult ? "Waiting for AI analysis..." :
                 "Fill in name, phone & district to submit"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

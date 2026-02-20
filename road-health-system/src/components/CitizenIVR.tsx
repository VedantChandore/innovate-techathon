"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Hash,
  X,
  CircleDot,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { ComplaintType, ComplaintSeverity } from "@/lib/types";
import { addComplaint } from "@/lib/complaintStore";

// ─── IVR Flow Steps ──────────────────────────────────────────

type IVRStep =
  | "idle"
  | "greeting"
  | "language"
  | "name"
  | "phone"
  | "district"
  | "location"
  | "complaint_type"
  | "severity"
  | "description"
  | "confirm"
  | "submitted"
  | "ended";

interface IVRData {
  name: string;
  phone: string;
  district: string;
  location: string;
  complaint_type: ComplaintType | "";
  severity: ComplaintSeverity | "";
  description: string;
  language: "en" | "hi" | "mr";
}

const DISTRICTS = [
  "Pune", "Mumbai", "Nashik", "Nagpur", "Satara",
  "Kolhapur", "Thane", "Raigad", "Ahmednagar",
  "Solapur", "Sangli", "Aurangabad",
];

const COMPLAINT_TYPES: { key: ComplaintType; label: string; keypad: string }[] = [
  { key: "pothole", label: "Pothole / Khadda", keypad: "1" },
  { key: "crack", label: "Road Crack / Daraar", keypad: "2" },
  { key: "waterlogging", label: "Waterlogging / Paani Bharav", keypad: "3" },
  { key: "debris", label: "Debris / Malaawa", keypad: "4" },
  { key: "missing_signage", label: "Missing Signage", keypad: "5" },
  { key: "guardrail_damage", label: "Guardrail Damage", keypad: "6" },
  { key: "road_collapse", label: "Road Collapse / Dhansav", keypad: "7" },
  { key: "other", label: "Other / Anya", keypad: "8" },
];

const SEVERITY_OPTIONS: { key: ComplaintSeverity; label: string; keypad: string; color: string }[] = [
  { key: "low", label: "Low — Minor inconvenience", keypad: "1", color: "text-green-600" },
  { key: "medium", label: "Medium — Needs attention", keypad: "2", color: "text-yellow-600" },
  { key: "high", label: "High — Dangerous", keypad: "3", color: "text-orange-600" },
  { key: "critical", label: "Critical — Immediate danger", keypad: "4", color: "text-red-600" },
];

// ─── Messages for each step ──────────────────────────────────

function getStepMessage(step: IVRStep, data: IVRData): string {
  switch (step) {
    case "greeting":
      return "🙏 Namaste! Welcome to RoadRakshak Citizen Complaint Hotline.\nHelping Maharashtra roads get better, one complaint at a time.\n\nThis IVR system lets you report road issues using voice or keypad.";
    case "language":
      return "Please select your language:\n  Press 1 → English\n  Press 2 → Hindi\n  Press 3 → Marathi";
    case "name":
      return "Please tell us your name.\nYou can speak or type it below.";
    case "phone":
      return "Please enter your phone number (10 digits).\nWe'll use this for follow-up.";
    case "district":
      return "Which district is the road issue in?\nSelect from the list or speak the district name.";
    case "location":
      return "Please describe the exact location.\nExample: \"NH-48, near Lonavala toll naka, before Khandala ghat\"";
    case "complaint_type":
      return "What type of road issue are you reporting?\nPress the number or speak the issue type:\n\n" +
        COMPLAINT_TYPES.map((t) => `  ${t.keypad} → ${t.label}`).join("\n");
    case "severity":
      return "How severe is this issue?\n\n" +
        SEVERITY_OPTIONS.map((s) => `  ${s.keypad} → ${s.label}`).join("\n");
    case "description":
      return "Please describe the issue in detail.\nSpeak clearly or type your description.\n\n💡 Mention landmarks, time of day, and how it affects traffic.";
    case "confirm":
      return `📋 Please confirm your complaint:\n\n` +
        `👤 Name: ${data.name}\n` +
        `📞 Phone: ${data.phone}\n` +
        `📍 District: ${data.district}\n` +
        `📍 Location: ${data.location}\n` +
        `⚠️ Issue: ${COMPLAINT_TYPES.find((t) => t.key === data.complaint_type)?.label || data.complaint_type}\n` +
        `🔴 Severity: ${data.severity}\n` +
        `📝 Description: ${data.description}\n\n` +
        `Press 1 to CONFIRM & Submit\nPress 2 to START OVER`;
    case "submitted":
      return "✅ Your complaint has been registered successfully!\n\nA complaint ID has been generated. Our team will review it within 24-48 hours.\n\nThank you for helping improve Maharashtra's roads! 🙏";
    case "ended":
      return "Call ended. Thank you for using RoadRakshak.\nDial again anytime to report another issue.";
    default:
      return "";
  }
}

// ─── Speech Synthesis ────────────────────────────────────────

function speak(text: string, lang: string = "en-IN") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[📋👤📞📍⚠️🔴📝✅🙏💡]/gu, "").replace(/\n/g, ". ");
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = lang;
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

// ─── Main Component ──────────────────────────────────────────

interface CitizenIVRProps {
  onComplaintSubmitted?: () => void;
}

export default function CitizenIVR({ onComplaintSubmitted }: CitizenIVRProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [step, setStep] = useState<IVRStep>("idle");
  const [data, setData] = useState<IVRData>({
    name: "",
    phone: "",
    district: "",
    location: "",
    complaint_type: "",
    severity: "",
    description: "",
    language: "en",
  });
  const [inputValue, setInputValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [callLog, setCallLog] = useState<string[]>([]);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll call log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [callLog]);

  // Timer
  useEffect(() => {
    if (step !== "idle" && step !== "ended") {
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  // Speak on step change
  useEffect(() => {
    if (step !== "idle" && step !== "ended" && !isMuted) {
      const msg = getStepMessage(step, data);
      speak(msg);
    }
    if (step !== "idle") {
      const msg = getStepMessage(step, data);
      if (msg) {
        addToLog("system", msg);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const addToLog = (role: "system" | "user", message: string) => {
    const prefix = role === "system" ? "🤖 IVR" : "👤 You";
    setCallLog((prev) => [...prev, `[${prefix}] ${message}`]);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ─── Speech Recognition ────────────────────────────────────

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addToLog("system", "⚠️ Speech recognition not available in this browser. Please type your response.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = data.language === "hi" ? "hi-IN" : data.language === "mr" ? "mr-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(interim || final);
      if (final) {
        setInputValue(final);
        setTranscript("");
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [data.language]);

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // ─── Step Handlers ─────────────────────────────────────────

  const startCall = () => {
    setStep("greeting");
    setCallTimer(0);
    setCallLog([]);
    setData({
      name: "", phone: "", district: "", location: "",
      complaint_type: "", severity: "", description: "", language: "en",
    });
    setSubmittedId(null);
    setTimeout(() => setStep("language"), 3000);
  };

  const endCall = () => {
    window.speechSynthesis?.cancel();
    stopListening();
    setStep("ended");
    setTimeout(() => {
      setStep("idle");
      setCallTimer(0);
    }, 3000);
  };

  const processInput = (value: string) => {
    if (!value.trim()) return;
    addToLog("user", value);
    setInputValue("");
    setTranscript("");

    switch (step) {
      case "language": {
        const v = value.trim();
        if (v === "1" || v.toLowerCase().includes("english")) {
          setData((d) => ({ ...d, language: "en" }));
        } else if (v === "2" || v.toLowerCase().includes("hindi")) {
          setData((d) => ({ ...d, language: "hi" }));
        } else if (v === "3" || v.toLowerCase().includes("marathi")) {
          setData((d) => ({ ...d, language: "mr" }));
        }
        setStep("name");
        break;
      }
      case "name":
        setData((d) => ({ ...d, name: value.trim() }));
        setStep("phone");
        break;
      case "phone": {
        const digits = value.replace(/\D/g, "");
        if (digits.length >= 10) {
          setData((d) => ({ ...d, phone: "+91 " + digits.slice(-10) }));
          setStep("district");
        } else {
          addToLog("system", "⚠️ Please enter a valid 10-digit phone number.");
        }
        break;
      }
      case "district": {
        const match = DISTRICTS.find(
          (d) => d.toLowerCase() === value.trim().toLowerCase()
        );
        if (match) {
          setData((d) => ({ ...d, district: match }));
          setStep("location");
        } else {
          const fuzzy = DISTRICTS.find((d) =>
            d.toLowerCase().includes(value.trim().toLowerCase()) ||
            value.trim().toLowerCase().includes(d.toLowerCase())
          );
          if (fuzzy) {
            setData((d) => ({ ...d, district: fuzzy }));
            setStep("location");
          } else {
            addToLog("system", `⚠️ District "${value}" not recognized. Please select from the list.`);
          }
        }
        break;
      }
      case "location":
        setData((d) => ({ ...d, location: value.trim() }));
        setStep("complaint_type");
        break;
      case "complaint_type": {
        const v = value.trim();
        const byKey = COMPLAINT_TYPES.find((t) => t.keypad === v);
        const byName = COMPLAINT_TYPES.find(
          (t) => t.label.toLowerCase().includes(v.toLowerCase()) || t.key === v.toLowerCase()
        );
        const match = byKey || byName;
        if (match) {
          setData((d) => ({ ...d, complaint_type: match.key }));
          setStep("severity");
        } else {
          addToLog("system", "⚠️ Invalid selection. Please press 1-8 or speak the issue type.");
        }
        break;
      }
      case "severity": {
        const v = value.trim();
        const byKey = SEVERITY_OPTIONS.find((s) => s.keypad === v);
        const byName = SEVERITY_OPTIONS.find(
          (s) => s.key === v.toLowerCase() || s.label.toLowerCase().includes(v.toLowerCase())
        );
        const match = byKey || byName;
        if (match) {
          setData((d) => ({ ...d, severity: match.key }));
          setStep("description");
        } else {
          addToLog("system", "⚠️ Invalid selection. Please press 1-4 or speak the severity.");
        }
        break;
      }
      case "description":
        setData((d) => ({ ...d, description: value.trim() }));
        setStep("confirm");
        break;
      case "confirm": {
        const v = value.trim();
        if (v === "1" || v.toLowerCase().includes("confirm") || v.toLowerCase().includes("yes")) {
          submitComplaint();
        } else if (v === "2" || v.toLowerCase().includes("start over") || v.toLowerCase().includes("no")) {
          setStep("name");
        }
        break;
      }
      default:
        break;
    }
  };

  const submitComplaint = () => {
    if (!data.complaint_type || !data.severity) return;
    const result = addComplaint({
      citizen_name: data.name,
      citizen_phone: data.phone,
      district: data.district,
      location_description: data.location,
      complaint_type: data.complaint_type as ComplaintType,
      severity: data.severity as ComplaintSeverity,
      description: data.description,
      citizen_language: data.language,
      source: "ivr_voice",
      voice_transcript: callLog.filter((l) => l.startsWith("[👤")).map((l) => l.replace("[👤 You] ", "")).join(" | "),
    });
    setSubmittedId(result.id);
    setStep("submitted");
    onComplaintSubmitted?.();
    setTimeout(() => endCall(), 5000);
  };

  // ─── Keypad Handler ────────────────────────────────────────

  const pressKey = (key: string) => {
    if (step === "language" || step === "complaint_type" || step === "severity" || step === "confirm") {
      processInput(key);
    } else {
      setInputValue((prev) => prev + key);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  // Floating action button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[9999] group"
        title="Citizen Complaint Hotline"
      >
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-orange-500 animate-ping opacity-25" />
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-2xl shadow-orange-500/30 group-hover:shadow-orange-500/50 group-hover:scale-110 transition-all duration-300">
            <Phone size={26} className="text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">IVR</span>
          </div>
        </div>
        <div className="absolute bottom-full right-0 mb-3 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          📞 Citizen Complaint Hotline
          <div className="absolute top-full right-5 w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
        </div>
      </button>
    );
  }

  // Phone Widget
  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-scale-in">
      <div className="w-[380px] bg-gray-900 rounded-3xl shadow-2xl shadow-black/40 overflow-hidden border border-gray-700/50">
        {/* ── Phone Header ───────────────────── */}
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-[11px] font-semibold tracking-wide uppercase">
                {step === "idle" ? "Ready" : step === "ended" ? "Call Ended" : "On Call"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {step !== "idle" && (
                <span className="text-gray-400 text-xs font-mono">{formatTime(callTimer)}</span>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 text-gray-400 hover:text-white transition"
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              <button
                onClick={() => { endCall(); setIsOpen(false); }}
                className="p-1 text-gray-400 hover:text-red-400 transition"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto mb-2 shadow-lg shadow-orange-500/20">
              <Phone size={24} className="text-white" />
            </div>
            <h3 className="text-white font-bold text-sm">RoadRakshak Helpline</h3>
            <p className="text-gray-400 text-xs">1800-ROAD-HELP (Toll Free)</p>
          </div>
        </div>

        {isExpanded && (
          <>
            <div className="bg-gray-950 border-t border-gray-800">
              <div className="h-[200px] overflow-y-auto p-4 space-y-2 text-xs" style={{ scrollbarWidth: "thin" }}>
                {step === "idle" ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                    <Phone size={32} className="text-gray-600" />
                    <p className="text-sm font-medium">Press Call to Start</p>
                    <p className="text-[11px] text-gray-600">Report road issues via voice or keypad</p>
                  </div>
                ) : (
                  <>
                    {callLog.map((entry, i) => {
                      const isSystem = entry.startsWith("[🤖");
                      return (
                        <div
                          key={i}
                          className={`${isSystem ? "text-gray-300" : "text-orange-400"} leading-relaxed whitespace-pre-line`}
                        >
                          {entry}
                        </div>
                      );
                    })}
                    {submittedId && (
                      <div className="text-green-400 font-semibold mt-2 p-2 bg-green-950/50 rounded-lg border border-green-800/30">
                        ✅ Complaint ID: {submittedId}
                      </div>
                    )}
                    {isListening && (
                      <div className="flex items-center gap-2 text-red-400 animate-pulse">
                        <CircleDot size={12} />
                        <span>Listening... {transcript && `"${transcript}"`}</span>
                      </div>
                    )}
                    <div ref={logEndRef} />
                  </>
                )}
              </div>

              {step === "district" && (
                <div className="px-4 pb-3 border-t border-gray-800 pt-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {DISTRICTS.map((d) => (
                      <button
                        key={d}
                        onClick={() => processInput(d)}
                        className="px-2 py-1.5 bg-gray-800 hover:bg-orange-600 text-gray-300 hover:text-white text-[10px] font-medium rounded-md transition-colors"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "complaint_type" && (
                <div className="px-4 pb-3 border-t border-gray-800 pt-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    {COMPLAINT_TYPES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => processInput(t.keypad)}
                        className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-800 hover:bg-orange-600 text-gray-300 hover:text-white text-[10px] font-medium rounded-md transition-colors text-left"
                      >
                        <span className="text-orange-400 font-bold">{t.keypad}</span>
                        <span className="truncate">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "severity" && (
                <div className="px-4 pb-3 border-t border-gray-800 pt-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    {SEVERITY_OPTIONS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => processInput(s.keypad)}
                        className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-800 hover:bg-orange-600 text-gray-300 hover:text-white text-[10px] font-medium rounded-md transition-colors text-left"
                      >
                        <span className="text-orange-400 font-bold">{s.keypad}</span>
                        <span className="truncate">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step !== "idle" && step !== "ended" && step !== "submitted" && step !== "greeting" && (
                <div className="px-4 pb-3 border-t border-gray-800 pt-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && processInput(inputValue)}
                      placeholder={
                        step === "phone" ? "Enter 10-digit number..." :
                        step === "name" ? "Enter your name..." :
                        step === "location" ? "Describe the location..." :
                        step === "description" ? "Describe the issue..." :
                        "Type or speak..."
                      }
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
                    />
                    <button
                      onClick={() => processInput(inputValue)}
                      className="p-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition"
                    >
                      <MessageSquare size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-900 border-t border-gray-800 p-4">
              {(step === "phone" || step === "language" || step === "complaint_type" || step === "severity" || step === "confirm") && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((key) => (
                    <button
                      key={key}
                      onClick={() => pressKey(key)}
                      className="h-10 rounded-xl bg-gray-800 hover:bg-gray-700 active:bg-orange-600 text-white font-semibold text-sm transition-all flex items-center justify-center"
                    >
                      {key === "#" ? <Hash size={16} /> : key}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => {
                    setIsMuted(!isMuted);
                    if (!isMuted) window.speechSynthesis?.cancel();
                  }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    isMuted ? "bg-red-500/20 text-red-400" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>

                {step === "idle" || step === "ended" ? (
                  <button
                    onClick={startCall}
                    className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:scale-105 active:scale-95 transition-all"
                    title="Start Call"
                  >
                    <Phone size={28} className="text-white" />
                  </button>
                ) : (
                  <button
                    onClick={endCall}
                    className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-105 active:scale-95 transition-all"
                    title="End Call"
                  >
                    <PhoneOff size={28} className="text-white" />
                  </button>
                )}

                <button
                  onClick={() => (isListening ? stopListening() : startListening())}
                  disabled={step === "idle" || step === "ended" || step === "submitted"}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    isListening
                      ? "bg-red-500 text-white animate-pulse"
                      : step === "idle" || step === "ended"
                      ? "bg-gray-800/50 text-gray-600"
                      : "bg-gray-800 text-gray-400 hover:text-white hover:bg-orange-600"
                  }`}
                  title={isListening ? "Stop Listening" : "Start Voice Input"}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
              </div>

              {step !== "idle" && step !== "ended" && (
                <div className="mt-3 flex items-center justify-center gap-1">
                  {["language", "name", "phone", "district", "location", "complaint_type", "severity", "description", "confirm"].map((s) => (
                    <div
                      key={s}
                      className={`h-1 rounded-full transition-all ${
                        s === step ? "w-4 bg-orange-500" :
                        ["language", "name", "phone", "district", "location", "complaint_type", "severity", "description", "confirm"].indexOf(s) <
                        ["language", "name", "phone", "district", "location", "complaint_type", "severity", "description", "confirm"].indexOf(step)
                          ? "w-2 bg-green-500"
                          : "w-2 bg-gray-700"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

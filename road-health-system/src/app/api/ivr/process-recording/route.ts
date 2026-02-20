/**
 * POST /api/ivr/process-recording
 *
 * Twilio's recordingStatusCallback hits this AFTER the recording is fully saved.
 * This is the ASYNC pipeline (caller has already hung up or moved on):
 *
 *   1. Download audio from Twilio (WAV format)
 *   2. Send to Gemini 1.5 Flash for transcription
 *   3. Send transcript to Gemini for structured parsing
 *   4. Store structured complaint in memory
 *
 * Twilio form fields we receive:
 *   RecordingUrl, RecordingSid, RecordingStatus, RecordingDuration,
 *   CallSid, AccountSid, From, To
 */
import { NextRequest, NextResponse } from "next/server";

// ─── In-memory complaint store (shared across API routes) ────

export interface IVRComplaint {
  id: string;
  timestamp: string;
  source: "twilio_ivr" | "browser_voice" | "web_form";
  callerNumber?: string;
  callSid?: string;
  recordingSid?: string;
  audioUrl?: string;
  rawTranscript: string;
  complaint_type: string;
  severity: string;
  road_name: string;
  landmark: string;
  district: string;
  division: string;
  description_en: string;
  urgency_score: number;
  language_detected: string;
  status: "new" | "acknowledged" | "in-progress" | "resolved" | "closed";
}

const globalStore = globalThis as unknown as { _ivrComplaints?: IVRComplaint[] };
if (!globalStore._ivrComplaints) {
  globalStore._ivrComplaints = [];
}

export function getIVRComplaints(): IVRComplaint[] {
  return globalStore._ivrComplaints || [];
}

export function addIVRComplaint(c: IVRComplaint) {
  if (!globalStore._ivrComplaints) globalStore._ivrComplaints = [];
  globalStore._ivrComplaints.push(c);
  console.log(`📦 Store now has ${globalStore._ivrComplaints.length} complaints`);
}

// ─── Route Handler ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Twilio sends form-encoded data
    const formData = await req.formData();

    const recordingUrl = formData.get("RecordingUrl") as string | null;
    const recordingSid = formData.get("RecordingSid") as string | null;
    const recordingStatus = formData.get("RecordingStatus") as string | null;
    const callerNumber = formData.get("From") as string | null;
    const callSid = formData.get("CallSid") as string | null;
    const recordingDuration = formData.get("RecordingDuration") as string | null;

    console.log("📞 Recording callback received:", {
      recordingUrl,
      recordingSid,
      recordingStatus,
      callerNumber,
      duration: recordingDuration,
    });

    // Twilio sends multiple status callbacks — only process "completed"
    if (recordingStatus && recordingStatus !== "completed") {
      console.log(`⏳ Ignoring status: ${recordingStatus}`);
      return NextResponse.json({ status: "waiting", recordingStatus });
    }

    if (!recordingUrl) {
      console.error("❌ No RecordingUrl in callback");
      return NextResponse.json({ error: "No recording URL" }, { status: 400 });
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!sid || !token) {
      console.error("❌ Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    // ── Step 1: Download audio from Twilio ─────────────────
    // Twilio recordings are available as .wav or .mp3
    // Use .wav for best quality with Gemini
    const audioFileUrl = `${recordingUrl}.wav`;
    const authHeader = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

    console.log(`⬇️ Downloading: ${audioFileUrl}`);

    const audioRes = await fetch(audioFileUrl, {
      headers: { Authorization: authHeader },
      redirect: "follow", // Twilio may 302 redirect
    });

    if (!audioRes.ok) {
      // Retry with .mp3 if .wav fails
      console.warn(`⚠️ WAV download failed (${audioRes.status}), trying MP3...`);
      const mp3Res = await fetch(`${recordingUrl}.mp3`, {
        headers: { Authorization: authHeader },
        redirect: "follow",
      });
      if (!mp3Res.ok) {
        console.error(`❌ Both WAV and MP3 download failed: ${mp3Res.status}`);
        return NextResponse.json({ error: "Failed to download recording" }, { status: 500 });
      }
      var audioBuffer = await mp3Res.arrayBuffer();
      var mimeType = "audio/mp3";
    } else {
      var audioBuffer = await audioRes.arrayBuffer();
      var mimeType = "audio/wav";
    }

    console.log(`🎵 Audio downloaded: ${audioBuffer.byteLength} bytes (${mimeType})`);

    // ── Step 2: Transcribe with Gemini ─────────────────────
    let transcript: string;

    if (geminiKey) {
      transcript = await transcribeWithGemini(audioBuffer, mimeType, geminiKey);
    } else {
      transcript = "[No Gemini API key — transcription unavailable]";
    }

    console.log(`📝 Transcript: "${transcript}"`);

    // ── Step 3: Parse with Gemini LLM ──────────────────────
    let parsed: Record<string, any>;

    if (geminiKey && transcript && !transcript.startsWith("[")) {
      parsed = await parseComplaintWithGemini(transcript, geminiKey);
    } else {
      parsed = {
        complaint_type: "other",
        severity: "medium",
        road_name: "unknown",
        landmark: "unknown",
        district: "unknown",
        division: "unknown",
        description_en: transcript,
        urgency_score: 5,
        language_detected: "unknown",
      };
    }

    console.log(`🧠 Parsed:`, JSON.stringify(parsed));

    // ── Step 4: Store complaint ────────────────────────────
    const complaint: IVRComplaint = {
      id: `RK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      source: "twilio_ivr",
      callerNumber: callerNumber || "unknown",
      callSid: callSid || undefined,
      recordingSid: recordingSid || undefined,
      audioUrl: recordingUrl || undefined,
      rawTranscript: transcript,
      complaint_type: parsed.complaint_type || "other",
      severity: parsed.severity || "medium",
      road_name: parsed.road_name || "unknown",
      landmark: parsed.landmark || "unknown",
      district: parsed.district || "unknown",
      division: parsed.division || "unknown",
      description_en: parsed.description_en || transcript,
      urgency_score: parsed.urgency_score || 5,
      language_detected: parsed.language_detected || "unknown",
      status: "new",
    };

    addIVRComplaint(complaint);
    console.log(`✅ Complaint stored: ${complaint.id} | Type: ${complaint.complaint_type} | District: ${complaint.district}`);

    return NextResponse.json({ success: true, id: complaint.id });
  } catch (err) {
    console.error("❌ IVR Processing Error:", err);
    return NextResponse.json(
      { error: "Processing failed", detail: String(err) },
      { status: 500 }
    );
  }
}

// ─── Gemini Audio Transcription ──────────────────────────────

async function transcribeWithGemini(
  audioBuffer: ArrayBuffer,
  mimeType: string,
  apiKey: string
): Promise<string> {
  const base64Audio = Buffer.from(audioBuffer).toString("base64");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Audio,
                  },
                },
                {
                  text: `Transcribe this audio recording exactly as spoken. 
The speaker is reporting a road problem in India, likely speaking Hindi, Marathi, or English (or a mix).
Return ONLY the transcription text. Do not add any commentary, labels, or formatting.
If the audio is unclear, transcribe whatever you can understand.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Gemini transcription API error (${res.status}):`, errorBody);
      return `[Transcription failed: HTTP ${res.status}]`;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("Gemini returned no text:", JSON.stringify(data));
      return "[Transcription returned empty]";
    }

    return text.trim();
  } catch (err) {
    console.error("Gemini transcription fetch error:", err);
    return `[Transcription error: ${String(err)}]`;
  }
}

// ─── Gemini Complaint Parsing ────────────────────────────────

async function parseComplaintWithGemini(
  transcript: string,
  apiKey: string
): Promise<Record<string, any>> {
  const fallback = {
    complaint_type: "other",
    severity: "medium",
    road_name: "unknown",
    landmark: "unknown",
    district: "unknown",
    division: "unknown",
    description_en: transcript,
    urgency_score: 5,
    language_detected: "unknown",
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a road complaint parser for Maharashtra, India.

A citizen called to report a road problem. Extract structured data from their transcript.

Transcript: "${transcript}"

Maharashtra divisions and districts:
- Konkan: Mumbai, Mumbai Suburban, Thane, Palghar, Raigad, Ratnagiri, Sindhudurg
- Pune: Pune, Satara, Sangli, Solapur, Kolhapur  
- Nashik: Nashik, Dhule, Nandurbar, Jalgaon, Ahmednagar
- Aurangabad: Chhatrapati Sambhajinagar, Jalna, Beed, Hingoli, Parbhani, Latur, Osmanabad, Nanded
- Amravati: Amravati, Akola, Yavatmal, Buldhana, Washim
- Nagpur: Nagpur, Wardha, Bhandara, Gondia, Chandrapur, Gadchiroli

Return ONLY valid JSON, no markdown fences, no extra text:
{
  "complaint_type": "pothole" | "crack" | "waterlogging" | "debris" | "missing_signage" | "guardrail_damage" | "road_collapse" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "road_name": "road name or highway number mentioned, or unknown",
  "landmark": "nearest landmark or specific location detail, or unknown",
  "district": "exact Maharashtra district name, or unknown",
  "division": "Konkan" | "Pune" | "Nashik" | "Aurangabad" | "Amravati" | "Nagpur" | "unknown",
  "description_en": "clean English summary in 1-2 sentences",
  "urgency_score": 1-10,
  "language_detected": "hi" | "mr" | "en" | "unknown"
}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512,
          },
        }),
      }
    );

    if (!res.ok) {
      console.error(`Gemini parse API error (${res.status}):`, await res.text());
      return fallback;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Clean any markdown fences
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Gemini parse error:", err);
    return fallback;
  }
}

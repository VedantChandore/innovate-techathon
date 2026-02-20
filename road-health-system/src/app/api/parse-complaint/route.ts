/**
 * POST /api/parse-complaint
 *
 * Takes a raw transcript (from browser Web Speech API or any text input)
 * and uses Gemini LLM to extract structured complaint data.
 * Then stores it in the same in-memory store as Twilio IVR complaints.
 *
 * Both Twilio calls and browser voice complaints end up in ONE dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { addIVRComplaint, type IVRComplaint } from "../ivr/process-recording/route";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, source = "browser_voice" } = body;

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 3) {
      return NextResponse.json({ error: "Transcript is required (min 3 chars)" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    let parsed: Record<string, unknown>;

    if (apiKey) {
      // ── Use Gemini LLM to parse ──
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

A citizen reported a road problem. Extract structured data from their message.

Citizen said: "${transcript}"

Maharashtra divisions: Konkan (Mumbai, Thane, Raigad, Ratnagiri, Sindhudurg), 
Pune (Pune, Satara, Sangli, Solapur, Kolhapur), 
Nashik (Nashik, Dhule, Nandurbar, Jalgaon, Ahmednagar),
Aurangabad (Chhatrapati Sambhajinagar, Jalna, Beed, Hingoli, Parbhani, Latur, Osmanabad, Nanded),
Amravati (Amravati, Akola, Yavatmal, Buldhana, Washim),
Nagpur (Nagpur, Wardha, Bhandara, Gondia, Chandrapur, Gadchiroli)

Return ONLY valid JSON (no markdown, no backticks):
{
  "complaint_type": "pothole" | "crack" | "waterlogging" | "debris" | "missing_signage" | "guardrail_damage" | "road_collapse" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "road_name": "road name/number or unknown",
  "landmark": "nearest landmark or unknown",
  "district": "Maharashtra district or unknown",
  "division": "Konkan" | "Pune" | "Nashik" | "Aurangabad" | "Amravati" | "Nagpur" | "unknown",
  "description_en": "clean English summary in 1-2 sentences",
  "urgency_score": number 1-10,
  "language_detected": "hi" | "mr" | "en" | "unknown"
}`,
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0.1 },
          }),
        }
      );

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = fallbackParse(transcript);
      }
    } else {
      // ── Fallback: keyword-based parsing when no Gemini key ──
      parsed = fallbackParse(transcript);
    }

    // ── Store complaint ──
    const complaint: IVRComplaint = {
      id: `RK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      source: source as IVRComplaint["source"],
      rawTranscript: transcript,
      complaint_type: (parsed.complaint_type as string) || "other",
      severity: (parsed.severity as string) || "medium",
      road_name: (parsed.road_name as string) || "unknown",
      landmark: (parsed.landmark as string) || "unknown",
      district: (parsed.district as string) || "unknown",
      division: (parsed.division as string) || "unknown",
      description_en: (parsed.description_en as string) || transcript,
      urgency_score: (parsed.urgency_score as number) || 5,
      language_detected: (parsed.language_detected as string) || "unknown",
      status: "new",
    };

    addIVRComplaint(complaint);

    return NextResponse.json({ success: true, complaint });
  } catch (err) {
    console.error("Parse complaint error:", err);
    return NextResponse.json({ error: "Failed to parse complaint" }, { status: 500 });
  }
}

// ─── Keyword-based fallback (no LLM) ────────────────────────

function fallbackParse(transcript: string) {
  const t = transcript.toLowerCase();

  let complaint_type = "other";
  if (t.includes("pothole") || t.includes("gadda") || t.includes("khadda") || t.includes("hole") || t.includes("गड्ढा") || t.includes("खड्डा")) {
    complaint_type = "pothole";
  } else if (t.includes("crack") || t.includes("daraar") || t.includes("दरार") || t.includes("toot")) {
    complaint_type = "crack";
  } else if (t.includes("water") || t.includes("paani") || t.includes("flood") || t.includes("bharav") || t.includes("पानी")) {
    complaint_type = "waterlogging";
  } else if (t.includes("debris") || t.includes("malaawa") || t.includes("fallen") || t.includes("tree") || t.includes("landslide")) {
    complaint_type = "debris";
  } else if (t.includes("sign") || t.includes("board")) {
    complaint_type = "missing_signage";
  } else if (t.includes("guardrail") || t.includes("railing") || t.includes("barrier")) {
    complaint_type = "guardrail_damage";
  } else if (t.includes("collapse") || t.includes("sink") || t.includes("dhans")) {
    complaint_type = "road_collapse";
  }

  let severity = "medium";
  if (t.includes("critical") || t.includes("bahut khatarnak") || t.includes("emergency") || t.includes("accident") || t.includes("death")) {
    severity = "critical";
  } else if (t.includes("dangerous") || t.includes("khatarnak") || t.includes("खतरनाक") || t.includes("high")) {
    severity = "high";
  } else if (t.includes("minor") || t.includes("small") || t.includes("chota") || t.includes("low")) {
    severity = "low";
  }

  // Try to extract district
  const districts = ["pune", "mumbai", "nashik", "nagpur", "satara", "kolhapur", "thane", "raigad", "ahmednagar", "solapur", "sangli", "aurangabad"];
  let district = "unknown";
  for (const d of districts) {
    if (t.includes(d)) {
      district = d.charAt(0).toUpperCase() + d.slice(1);
      break;
    }
  }

  // Try to extract road name
  const nhMatch = t.match(/nh[\s-]?(\d+)/i);
  const shMatch = t.match(/sh[\s-]?(\d+)/i);
  const road_name = nhMatch ? `NH-${nhMatch[1]}` : shMatch ? `SH-${shMatch[1]}` : "unknown";

  return {
    complaint_type,
    severity,
    road_name,
    landmark: "unknown",
    district,
    division: "unknown",
    description_en: transcript,
    urgency_score: severity === "critical" ? 9 : severity === "high" ? 7 : severity === "medium" ? 5 : 3,
    language_detected: "unknown",
  };
}

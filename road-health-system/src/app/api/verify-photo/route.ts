/**
 * POST /api/verify-photo
 *
 * Two modes:
 *  1. ANALYZE mode (no description) — Gemini looks at the photo and generates
 *     issue type, severity, and a description automatically.
 *  2. VERIFY mode (description provided) — Gemini compares the photo with the
 *     user's claim and returns a match score.
 */
import { NextRequest, NextResponse } from "next/server";

interface VerifyPhotoRequest {
  image_base64: string;
  complaint_type?: string;
  description?: string;
  severity?: string;
  mode?: "analyze" | "verify";   // default: auto-detect
}

interface VerifyPhotoResponse {
  ai_photo_analysis: string;
  ai_match_score: number;
  ai_match_verdict: "match" | "mismatch" | "inconclusive";
  ai_suggested_type?: string;
  ai_suggested_severity?: string;
  ai_generated_description?: string;   // full description from analyze mode
  is_road_photo?: boolean;
}

const ANALYZE_PROMPT = `You are an AI road condition inspector for Maharashtra PWD (Public Works Department), India.

Analyze this photo carefully.

YOUR TASKS:
1. Determine if this is genuinely a photo of a road/highway (not a random or fake image)
2. Identify the specific road issue visible (pothole, crack, waterlogging, debris, missing signage, guardrail damage, road collapse, or other)
3. Assess the severity: low (minor cosmetic), medium (needs attention), high (dangerous), critical (immediate danger to life/vehicle)
4. Write a detailed 2-3 sentence description of the road condition suitable for an official complaint report
5. Rate your confidence (0-100) in the analysis

Return ONLY valid JSON (no markdown, no backticks):
{
  "is_road_photo": true/false,
  "issue_type": "pothole" | "crack" | "waterlogging" | "debris" | "missing_signage" | "guardrail_damage" | "road_collapse" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "description": "Detailed 2-3 sentence description for the complaint report. Mention specific damage, approximate size, and traffic impact.",
  "photo_summary": "Short 1-sentence summary of what the AI sees",
  "confidence": number (0-100),
  "reasoning": "brief explanation"
}`;

const VERIFY_PROMPT = (type: string, severity: string, desc: string) =>
  `You are an AI road condition inspector for Maharashtra PWD (Public Works Department), India.

Analyze this road condition photo and compare it with the citizen's complaint.

CITIZEN'S CLAIM:
- Complaint Type: ${type}
- Severity: ${severity}
- Description: "${desc}"

YOUR TASKS:
1. Describe what you actually see in the photo regarding road conditions
2. Determine if this is genuinely a photo of a road/highway issue
3. Check if the citizen's claimed complaint type and severity match what you see
4. Give a match score (0-100)

SCORING: 80-100 = clear match, 50-79 = partial, 20-49 = weak, 0-19 = mismatch/fake

Return ONLY valid JSON (no markdown, no backticks):
{
  "photo_description": "2-3 sentence description of what you see",
  "is_road_photo": true/false,
  "match_score": number (0-100),
  "verdict": "match" | "mismatch" | "inconclusive",
  "suggested_type": "pothole" | "crack" | "waterlogging" | "debris" | "missing_signage" | "guardrail_damage" | "road_collapse" | "other",
  "suggested_severity": "low" | "medium" | "high" | "critical",
  "reasoning": "brief explanation"
}`;

export async function POST(req: NextRequest) {
  try {
    const body: VerifyPhotoRequest = await req.json();
    const { image_base64, complaint_type, description, severity } = body;

    if (!image_base64) {
      return NextResponse.json({ error: "image_base64 is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        ai_photo_analysis: "Photo analysis unavailable (no API key configured)",
        ai_match_score: 50,
        ai_match_verdict: "inconclusive",
      } as VerifyPhotoResponse);
    }

    // Auto-detect mode: if no description → analyze, otherwise verify
    const isAnalyze = body.mode === "analyze" || !description;

    // Strip data URL prefix if present
    let rawBase64 = image_base64;
    let mimeType = "image/jpeg";
    const dataUrlMatch = image_base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      rawBase64 = dataUrlMatch[2];
    }

    const prompt = isAnalyze
      ? ANALYZE_PROMPT
      : VERIFY_PROMPT(complaint_type || "unknown", severity || "unknown", description || "");

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: rawBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            // @ts-expect-error — thinkingConfig is valid for Gemini 2.5
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[verify-photo] Gemini API error:", geminiRes.status, errText);
      return NextResponse.json({
        ai_photo_analysis: "Photo analysis failed — Gemini API error",
        ai_match_score: 50,
        ai_match_verdict: "inconclusive",
      } as VerifyPhotoResponse);
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textPart = parts.filter((p: any) => !p.thought && typeof p.text === "string").pop();
    const text = textPart?.text || "{}";

    let parsed: Record<string, unknown>;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        ai_photo_analysis: "Unable to analyze photo — AI returned unparseable response",
        ai_match_score: 50,
        ai_match_verdict: "inconclusive",
      } as VerifyPhotoResponse);
    }

    if (isAnalyze) {
      // ANALYZE MODE — return generated description, type, severity
      const result: VerifyPhotoResponse = {
        ai_photo_analysis: (parsed.photo_summary as string) || (parsed.reasoning as string) || "Photo analyzed",
        ai_generated_description: (parsed.description as string) || "",
        ai_match_score: typeof parsed.confidence === "number"
          ? Math.min(100, Math.max(0, parsed.confidence))
          : 70,
        ai_match_verdict: (parsed.is_road_photo === false) ? "mismatch" : "match",
        ai_suggested_type: parsed.issue_type as string | undefined,
        ai_suggested_severity: parsed.severity as string | undefined,
        is_road_photo: parsed.is_road_photo as boolean | undefined,
      };
      return NextResponse.json(result);
    } else {
      // VERIFY MODE — compare with user's claim
      const result: VerifyPhotoResponse = {
        ai_photo_analysis: (parsed.photo_description as string) ||
          (parsed.reasoning as string) || "Photo analyzed",
        ai_match_score: typeof parsed.match_score === "number"
          ? Math.min(100, Math.max(0, parsed.match_score))
          : 50,
        ai_match_verdict: (["match", "mismatch", "inconclusive"].includes(parsed.verdict as string)
          ? parsed.verdict
          : "inconclusive") as "match" | "mismatch" | "inconclusive",
        ai_suggested_type: parsed.suggested_type as string | undefined,
        ai_suggested_severity: parsed.suggested_severity as string | undefined,
        is_road_photo: parsed.is_road_photo as boolean | undefined,
      };
      return NextResponse.json(result);
    }
  } catch (err) {
    console.error("[verify-photo] Error:", err);
    return NextResponse.json(
      { error: "Failed to analyze photo", details: String(err) },
      { status: 500 }
    );
  }
}

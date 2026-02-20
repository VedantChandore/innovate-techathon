/**
 * POST /api/ivr/record
 *
 * After language selection, this route tells the caller to describe
 * their road issue and starts recording.
 *
 * Query param: ?lang=hi|en|mr
 *
 * Flow: voice → gather-language → THIS → <Record> → handle-recording + process-recording
 */
import { NextRequest, NextResponse } from "next/server";

function twimlResponse(xml: string) {
  return new NextResponse(xml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

const PROMPTS: Record<string, { voice: string; langAttr: string; message: string; noInput: string }> = {
  hi: {
    voice: "Polly.Aditi",
    langAttr: "hi-IN",
    message:
      "धन्यवाद। कृपया बीप के बाद सड़क की समस्या बताएं। " +
      "सड़क का नाम, जगह, जिला, और समस्या का विवरण बताएं। " +
      "जितना हो सके विस्तार से बोलें। अधिकतम 60 सेकंड।",
    noInput: "कोई आवाज़ नहीं मिली। कृपया दोबारा कॉल करें। धन्यवाद।",
  },
  en: {
    voice: "Polly.Aditi",
    langAttr: "en-IN",
    message:
      "Thank you. After the beep, please describe the road problem. " +
      "Mention the road name, location, district, and a detailed description. " +
      "You have up to 60 seconds.",
    noInput: "We didn't receive any input. Please call again. Thank you.",
  },
  mr: {
    voice: "Polly.Aditi",
    langAttr: "mr-IN",
    message:
      "धन्यवाद। कृपया बीप नंतर रस्त्याची समस्या सांगा। " +
      "रस्त्याचे नाव, ठिकाण, जिल्हा आणि तपशील सांगा। " +
      "जास्तीत जास्त 60 सेकंद बोला.",
    noInput: "आम्हाला कोणताही आवाज मिळाला नाही. कृपया पुन्हा कॉल करा. धन्यवाद.",
  },
};

export async function POST(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || "hi";
  const prompt = PROMPTS[lang] || PROMPTS.hi;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${prompt.voice}" language="${prompt.langAttr}">
    ${prompt.message}
  </Say>
  <Pause length="1"/>
  <Record
    maxLength="60"
    action="${appUrl}/api/ivr/handle-recording?lang=${lang}"
    recordingStatusCallback="${appUrl}/api/ivr/process-recording"
    recordingStatusCallbackMethod="POST"
    recordingStatusCallbackEvent="completed"
    playBeep="true"
    trim="trim-silence"
    timeout="5"
    transcribe="false"
  />
  <Say voice="${prompt.voice}" language="${prompt.langAttr}">
    ${prompt.noInput}
  </Say>
</Response>`;

  return twimlResponse(twiml);
}

export async function GET(req: NextRequest) {
  return POST(req);
}

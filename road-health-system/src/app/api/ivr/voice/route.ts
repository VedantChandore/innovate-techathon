/**
 * POST /api/ivr/voice
 *
 * Twilio webhook — called when someone dials the Twilio number.
 * This is the ENTRY POINT of the phone IVR flow:
 *
 *   1. Greet caller in Hindi
 *   2. Ask language preference via <Gather> (press 1/2/3)
 *   3. If no input, default to Hindi and go to record step
 *
 * Flow: voice → gather-language → record → handle-recording (TwiML) + process-recording (async)
 */
import { NextRequest, NextResponse } from "next/server";

function twimlResponse(xml: string) {
  return new NextResponse(xml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";

  // Check if this is a Gather callback (caller pressed a digit)
  const formData = await req.formData().catch(() => null);
  const digits = formData?.get("Digits") as string | null;

  if (digits) {
    // Caller selected a language — go to record
    return redirectToRecord(appUrl, digits);
  }

  // Initial greeting + language selection
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">
    नमस्ते! रोड रक्षक हेल्पलाइन में आपका स्वागत है।
  </Say>
  <Pause length="1"/>
  <Gather numDigits="1" action="${appUrl}/api/ivr/voice" method="POST" timeout="5">
    <Say voice="Polly.Aditi" language="hi-IN">
      कृपया अपनी भाषा चुनें।
      हिंदी के लिए 1 दबाएं।
      English ke liye 2 dabayein.
      मराठी साठी 3 दबा.
    </Say>
  </Gather>
  <Say voice="Polly.Aditi" language="hi-IN">
    कोई इनपुट नहीं मिला। हम हिंदी में आगे बढ़ रहे हैं।
  </Say>
  <Redirect method="POST">${appUrl}/api/ivr/record?lang=hi</Redirect>
</Response>`;

  return twimlResponse(twiml);
}

function redirectToRecord(appUrl: string, digits: string) {
  const langMap: Record<string, string> = { "1": "hi", "2": "en", "3": "mr" };
  const lang = langMap[digits] || "hi";

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${appUrl}/api/ivr/record?lang=${lang}</Redirect>
</Response>`;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

// Twilio sometimes sends GET on initial webhook
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${appUrl}/api/ivr/voice</Redirect>
</Response>`;
  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

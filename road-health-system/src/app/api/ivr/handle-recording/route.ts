/**
 * POST /api/ivr/handle-recording
 *
 * Called by Twilio immediately after the caller STOPS speaking (the <Record> action URL).
 * This runs synchronously during the call — caller hears this response.
 *
 * We give them a ticket number, ask if they want to file another complaint,
 * or hang up. 
 *
 * The actual AI processing happens ASYNC via /api/ivr/process-recording
 * (recordingStatusCallback).
 */
import { NextRequest, NextResponse } from "next/server";

function twimlResponse(xml: string) {
  return new NextResponse(xml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

const MESSAGES: Record<string, { voice: string; langAttr: string; thankYou: string; ticket: string; another: string; goodbye: string }> = {
  hi: {
    voice: "Polly.Aditi",
    langAttr: "hi-IN",
    thankYou: "धन्यवाद! आपकी शिकायत दर्ज हो गई है।",
    ticket: "आपका टिकट नंबर है:",
    another: "एक और शिकायत दर्ज करने के लिए 1 दबाएं। कॉल समाप्त करने के लिए 2 दबाएं या लाइन पर रहें।",
    goodbye: "रोड रक्षक को कॉल करने के लिए धन्यवाद। हमारी टीम जल्द से जल्द कार्रवाई करेगी। नमस्ते।",
  },
  en: {
    voice: "Polly.Aditi",
    langAttr: "en-IN",
    thankYou: "Thank you! Your complaint has been recorded.",
    ticket: "Your ticket number is:",
    another: "Press 1 to file another complaint. Press 2 or stay on the line to end the call.",
    goodbye: "Thank you for calling RoadRakshak. Our team will take action soon. Goodbye.",
  },
  mr: {
    voice: "Polly.Aditi",
    langAttr: "mr-IN",
    thankYou: "धन्यवाद! तुमची तक्रार नोंदवली गेली आहे.",
    ticket: "तुमचा तिकीट क्रमांक आहे:",
    another: "आणखी एक तक्रार नोंदवण्यासाठी 1 दबा. कॉल संपवण्यासाठी 2 दबा.",
    goodbye: "रोड रक्षक ला कॉल केल्याबद्दल धन्यवाद. आमची टीम लवकरच कार्यवाही करेल. नमस्कार.",
  },
};

export async function POST(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || "hi";
  const msg = MESSAGES[lang] || MESSAGES.hi;

  // Twilio sends recording details in the form data
  const formData = await req.formData().catch(() => null);
  const digits = formData?.get("Digits") as string | null;

  // If caller pressed 1 (file another), redirect to record
  if (digits === "1") {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${appUrl}/api/ivr/record?lang=${lang}</Redirect>
</Response>`;
    return twimlResponse(twiml);
  }

  // If caller pressed 2, hang up
  if (digits === "2") {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${msg.voice}" language="${msg.langAttr}">${msg.goodbye}</Say>
  <Hangup/>
</Response>`;
    return twimlResponse(twiml);
  }

  // Generate short ticket ID
  const ticketId = `RK-${Date.now().toString().slice(-6)}`;

  // Thank the caller, give ticket, ask if they want another
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${msg.voice}" language="${msg.langAttr}">
    ${msg.thankYou}
    ${msg.ticket} ${ticketId.split("").join(". ")}.
  </Say>
  <Pause length="1"/>
  <Gather numDigits="1" action="${appUrl}/api/ivr/handle-recording?lang=${lang}" method="POST" timeout="5">
    <Say voice="${msg.voice}" language="${msg.langAttr}">
      ${msg.another}
    </Say>
  </Gather>
  <Say voice="${msg.voice}" language="${msg.langAttr}">
    ${msg.goodbye}
  </Say>
  <Hangup/>
</Response>`;

  return twimlResponse(twiml);
}

export async function GET(req: NextRequest) {
  return POST(req);
}

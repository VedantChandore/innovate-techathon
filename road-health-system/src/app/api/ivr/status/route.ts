/**
 * GET /api/ivr/status
 *
 * Health-check / debug endpoint.
 * Shows whether Twilio and Gemini are configured, and the IVR flow URLs.
 * Useful during setup and demo.
 */
import { NextRequest, NextResponse } from "next/server";
import { getIVRComplaints } from "../process-recording/route";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const hasTwilioSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasTwilioToken = !!process.env.TWILIO_AUTH_TOKEN;
  const hasTwilioPhone = !!process.env.TWILIO_PHONE_NUMBER;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  const complaints = getIVRComplaints();

  return NextResponse.json({
    status: "ok",
    config: {
      appUrl,
      twilioSid: hasTwilioSid ? `${process.env.TWILIO_ACCOUNT_SID!.slice(0, 8)}...` : "NOT SET",
      twilioToken: hasTwilioToken ? "SET (hidden)" : "NOT SET ⚠️",
      twilioPhone: process.env.TWILIO_PHONE_NUMBER || "NOT SET ⚠️",
      geminiKey: hasGemini ? `${process.env.GEMINI_API_KEY!.slice(0, 10)}...` : "NOT SET ⚠️",
    },
    ivrFlow: {
      step1_webhook: `${appUrl}/api/ivr/voice`,
      step2_record: `${appUrl}/api/ivr/record?lang=hi`,
      step3_handleRecording: `${appUrl}/api/ivr/handle-recording?lang=hi`,
      step4_processRecording: `${appUrl}/api/ivr/process-recording`,
      dashboard: `${appUrl}/api/ivr/complaints`,
    },
    twilioWebhookSetup: {
      instructions: [
        "1. Go to https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
        `2. Click on your number: ${process.env.TWILIO_PHONE_NUMBER || "+12187898977"}`,
        `3. Set 'A CALL COMES IN' webhook to: ${appUrl}/api/ivr/voice (HTTP POST)`,
        "4. Save the configuration",
        "NOTE: If using localhost, use ngrok to create a public URL first:",
        "  ngrok http 3000",
        "  Then update NEXT_PUBLIC_APP_URL in .env.local with the ngrok https URL",
      ],
    },
    store: {
      totalComplaints: complaints.length,
      latestComplaint: complaints.length > 0 ? complaints[complaints.length - 1] : null,
    },
  });
}

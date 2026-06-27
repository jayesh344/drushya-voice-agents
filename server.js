// ============================================================
// Drushya Digital India — AI Voice Calling Agent Backend
// Connects: Twilio (calls) + Claude (AI brain) + ElevenLabs (voice)
// ============================================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: true })); // Twilio sends form-encoded data
app.use(express.json());

// Folder where we save generated voice replies (served back to Twilio)
const AUDIO_DIR = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
app.use('/audio', express.static(AUDIO_DIR));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory store of conversation history per call (CallSid -> messages[])
// NOTE: This resets if the server restarts. For production, use a real database.
const conversations = {};

// ------------------------------------------------------------
// The AI's instructions — same script we built for the Vapi version
// ------------------------------------------------------------
const SYSTEM_PROMPT = `
You are a friendly, professional customer support executive for Drushya Digital India
(pronounced "Droosh-ya" Digital India), a web & app development company.

## Language & tone
- Speak in a natural Hindi-English mix (Hinglish). Keep it warm, polite, and approachable.
- Always reply in complete, natural sentences — never keyword fragments.
- Keep responses concise (1-3 sentences), since this is a phone conversation.

## Primary goals
1) Greet the caller warmly (only on the first turn).
2) Understand what they need: Website, Mobile App, Graphic Design/Branding, or Other/Not sure.
3) Collect: Name, Contact number, Service of interest, Brief requirement.
4) Answer FAQs about services and pricing using the ranges below.
5) If you can't answer something, say you'll take a message and the team will call back.

## Website Packages
- Classic - Rs 14,999: 5 pages + domain + hosting + SSL + business email
- Star - Rs 24,999: 10 pages + SEO-ready + payment gateway
- E Plus - Rs 39,999: E-commerce + up to 20 pages
- Custom - Rs 99,999+: Custom functionality as per requirement

## Mobile App & Branding
We don't have fixed packages for these — say a team member will share a custom quote
after understanding the requirement.

## Working hours
Monday to Sunday, 10 AM to 6 PM. Contact email for callbacks: drushyaindia@gmail.com

## Guardrails
- Never promise exact delivery dates or guarantees.
- Keep replies short — this is a live phone call, not a chat.
`.trim();

// ------------------------------------------------------------
// Helper: ask Claude for the next reply given conversation history
// ------------------------------------------------------------
async function getAIReply(callSid, userText) {
  if (!conversations[callSid]) {
    conversations[callSid] = [];
  }
  conversations[callSid].push({ role: 'user', content: userText });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: conversations[callSid],
  });

  const replyText = response.content[0].text;
  conversations[callSid].push({ role: 'assistant', content: replyText });
  return replyText;
}

// ------------------------------------------------------------
// Helper: convert text to speech using ElevenLabs, save as mp3,
// return a public URL Twilio can fetch and play.
// ------------------------------------------------------------
async function textToSpeechUrl(text, callSid, turnIndex) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    }
  );

  const fileName = `${callSid}-${turnIndex}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);
  fs.writeFileSync(filePath, response.data);

  return `${process.env.PUBLIC_BASE_URL}/audio/${fileName}`;
}

// ------------------------------------------------------------
// ROUTE 1: Twilio calls this when a call first comes in
// Set this URL as your Twilio number's "Voice Webhook"
// ------------------------------------------------------------
app.post('/voice', async (req, res) => {
  const callSid = req.body.CallSid;
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    const greeting =
      'Namaste! Drushya Digital India mein call karne ke liye dhanyavaad. Main aapki kaise help kar sakti hoon?';
    const audioUrl = await textToSpeechUrl(greeting, callSid, 0);

    // Save the greeting as the first AI turn in history
    conversations[callSid] = [{ role: 'assistant', content: greeting }];

    twiml.play(audioUrl);
    twiml.gather({
      input: 'speech',
      language: 'hi-IN',
      speechTimeout: 'auto',
      action: '/process-speech',
      method: 'POST',
    });
  } catch (err) {
    console.error('Error in /voice:', err.message);
    twiml.say('Sorry, kuch problem hui. Please try again later.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------------------------------------------------------------
// ROUTE 2: Twilio calls this after it captures what the caller said
// ------------------------------------------------------------
app.post('/process-speech', async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult || '';
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    if (!speechResult) {
      twiml.say('Maaf kijiye, mujhe sunai nahi diya. Phir se boliye.');
      twiml.gather({
        input: 'speech',
        language: 'hi-IN',
        speechTimeout: 'auto',
        action: '/process-speech',
        method: 'POST',
      });
      return res.type('text/xml').send(twiml.toString());
    }

    const replyText = await getAIReply(callSid, speechResult);
    const turnIndex = conversations[callSid].length;
    const audioUrl = await textToSpeechUrl(replyText, callSid, turnIndex);

    twiml.play(audioUrl);
    twiml.gather({
      input: 'speech',
      language: 'hi-IN',
      speechTimeout: 'auto',
      action: '/process-speech',
      method: 'POST',
    });
  } catch (err) {
    console.error('Error in /process-speech:', err.message);
    twiml.say('Sorry, kuch problem hui. Hamari team aapko callback karegi.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------------------------------------------------------------
// ROUTE 3: Clean up conversation history when call ends
// Set this as your Twilio number's "Call Status Changes" webhook (optional)
// ------------------------------------------------------------
app.post('/call-status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  if (callStatus === 'completed' && conversations[callSid]) {
    console.log(`Call ${callSid} ended. Transcript:`, conversations[callSid]);
    delete conversations[callSid];
  }
  res.sendStatus(200);
});

// Health check route — useful to confirm the server is running
app.get('/', (req, res) => {
  res.send('Drushya Digital India Voice Agent backend is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

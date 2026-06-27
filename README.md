# Drushya Digital India — AI Voice Agent Backend

Yeh backend Twilio (calls), Claude (AI), aur ElevenLabs (voice) ko jodta hai.

## Files
- `server.js` — main backend code
- `package.json` — dependencies list
- `.env.example` — yahan apni API keys daalni hain

## Setup Steps

### 1. `.env` file banao
`.env.example` ko copy karke naam badlo `.env` — aur apni 4 API keys/values daal do:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- ANTHROPIC_API_KEY
- ELEVENLABS_API_KEY
- ELEVENLABS_VOICE_ID
- PUBLIC_BASE_URL (deploy karne ke baad milega — Step 3 dekho)

### 2. Render.com pe Deploy Karo
(Render is free for small projects aur Twilio webhooks ke liye chalta hai 24x7)

1. **github.com** pe account banao (agar nahi hai)
2. Iss poore folder ko GitHub pe ek naye repository mein upload karo
3. **render.com** pe jao, sign up karo
4. **"New +"** → **"Web Service"** click karo
5. Apna GitHub repo connect karo
6. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
7. **Environment Variables** section mein apni `.env` wali saari values daal do (ek-ek karke)
8. **"Create Web Service"** click karo — 2-3 minute mein deploy ho jayega
9. Render ek URL dega jaisa: `https://drushya-voice-agent.onrender.com`
10. Isi URL ko `.env` mein `PUBLIC_BASE_URL` mein daal do, aur Render ke environment variables mein bhi update kar do

### 3. Twilio Number ko Backend se Connect Karo
1. **twilio.com/console** → **Phone Numbers** → apna number kholo
2. **"Voice Configuration"** section mein:
   - "A call comes in" → **Webhook**
   - URL daalo: `https://drushya-voice-agent.onrender.com/voice`
   - Method: **HTTP POST**
3. Save karo

### 4. Test Karo
Apne Twilio number par call karo — AI agent Hinglish mein baat karega!

## Important Notes
- Conversation history abhi server ki memory mein save hoti hai — server restart hone par delete ho jaati hai. Baad mein real database (jaise MongoDB) add karna chahiye.
- ElevenLabs aur Claude API dono **paid usage** par chalte hain — billing zaroor set karo.
- Free Render plan thoda slow start ho sakta hai (cold start) — paid plan ($7/month) better hoga real usage ke liye.

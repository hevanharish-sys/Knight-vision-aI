# Knight Vision AI

**One AI. Infinite Ways to Communicate.**

Multimodal accessibility platform for speech ↔ text, sign language interpretation, vision assistance, document reading, live translation, and emergency SOS.

## Quick start

```bash
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY (for local Next API) and Supabase keys
npm run dev

# Optional: run Render-style API locally
npm --prefix server install
npm run dev:api
# then set NEXT_PUBLIC_API_URL=http://localhost:4000 in .env.local
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

### Backend — Render
1. New Web Service from this repo
2. Root directory: `server`
3. Build: `npm install` · Start: `npm start`
4. Env vars: `GEMINI_API_KEY`, `ALLOWED_ORIGIN=https://YOUR_VERCEL_APP.vercel.app`
5. Copy the service URL (e.g. `https://knight-vision-api.onrender.com`)

Or use Blueprint: `render.yaml` at the repo root.

### Frontend — Vercel
1. Import this repo in Vercel
2. Framework: Next.js (root of repo)
3. Env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_API_URL=https://YOUR_RENDER_API.onrender.com`
4. Deploy, then set Render `ALLOWED_ORIGIN` to the Vercel URL

Auth (name + PIN) stays on Supabase from the browser; Gemini AI calls go to Render.

## Modules

| Module | How it works |
|--------|----------------|
| Speech ↔ Text | Web Speech API live captions + Gemini audio transcription fallback |
| Sign Interpreter | Holistic SLR: pose+face+both hands → 30–60 frame sequence → recognize → smooth → speech |
| Vision Assistant | Camera frames → Gemini vision descriptions + TTS |
| Live Translator | Speech/text → Gemini translation across Indian languages |
| Document Reader | Image OCR + plain-language rewrite via Gemini |
| Emergency SOS | Geolocation + medical profile + local-language announcement |

## Judge demo script

1. Onboarding → choose **Deaf** → Sign module → open palm (**HELP**) or peace (**CHEST PAIN**)
2. Switch profile to **Blind** → Vision → live describe stairs / medicine label
3. Speech ↔ Text → speak or tap a hospital demo line → giant captions
4. Hit **SOS** → location + medical card + spoken assistance request

## Notes

- Sign language covers a **bounded demo vocabulary**, not unrestricted ASL.
- Chromium browsers work best for Web Speech recognition.
- Without `GEMINI_API_KEY`, browser STT/TTS and MediaPipe sign still run; vision / Gemini transcription / translate / document need the key.

// lib/voice-transcribe.ts
// Transcribe an inbound WhatsApp voice note with OpenAI Whisper so the bot can
// answer what the customer actually said instead of asking them to type.
// Returns the transcript text, or null on any failure (caller falls back to the
// "please type" behaviour). Whisper is OpenAI-only, so this uses OPENAI_API_KEY
// directly; if that key is absent the feature is simply a no-op.

export async function transcribeWhatsAppAudio(
  mediaId: string,
  accessToken: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith('sk-')) return null;

  try {
    const token = accessToken.replace(/﻿/g, '').trim();

    // 1) Resolve the Meta media download URL.
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) return null;
    const metaData = await metaRes.json() as { url?: string; mime_type?: string };
    if (!metaData.url) return null;

    // 2) Download the audio bytes (needs the same Bearer token).
    const mediaRes = await fetch(metaData.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!mediaRes.ok) return null;
    const buffer = Buffer.from(await mediaRes.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 24 * 1024 * 1024) return null; // Whisper caps ~25MB

    // WhatsApp voice notes are audio/ogg (opus); Whisper accepts ogg/mp3/m4a/etc.
    const mimeType = (metaData.mime_type ?? mediaRes.headers.get('content-type') ?? 'audio/ogg').split(';')[0] || 'audio/ogg';
    const ext = mimeType.split('/')[1] ?? 'ogg';

    // 3) Send to Whisper.
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), `voice.${ext}`);
    form.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      console.error('[VoiceTranscribe] Whisper failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json() as { text?: string };
    const text = data.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (err) {
    console.error('[VoiceTranscribe] error:', err);
    return null;
  }
}

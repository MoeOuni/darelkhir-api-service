import OpenAI from 'openai';
import { getConfig } from './config';

/**
 * Says a line out loud, in a voice worth listening to.
 *
 * The phone's own Arabic voice is free and sounds it. This sends the text to a
 * speech model instead and hands back the audio, which the app plays.
 *
 * It is deliberately a separate provider from the one that reads orders: the
 * reading is Claude's, which has no voice at all, and speech is bought from
 * whoever does it best for the money. Both are settings.
 */

export interface Spoken {
  /** The audio itself, base64 so it survives the JSON trip to the phone. */
  audio: string;
  /** What the phone should treat it as. */
  mime: string;
}

/** Roughly what a reply costs to say, for the log. */
const USD_PER_MILLION_CHARS = 15;

export async function speak(text: string, voiceOverride?: string): Promise<Spoken> {
  const { ttsProvider, ttsApiKey } = getConfig();
  if (!ttsApiKey) throw new Error('TTS_API_KEY is not configured for this stage');

  return ttsProvider === 'fish' ? speakWithFish(text, voiceOverride) : speakWithOpenAI(text, voiceOverride);
}

/**
 * Fish Audio, whose API is its own shape rather than OpenAI's.
 *
 * The model is a header, not a body field, and the voice is a `reference_id`
 * pointing at a voice in the account — which is where a cloned Tunisian voice
 * would live, and the reason for choosing Fish at all. Left unset it uses the
 * model's default voice.
 */
async function speakWithFish(text: string, voiceOverride?: string): Promise<Spoken> {
  const { ttsApiKey, ttsBaseUrl, ttsModel, ttsVoice } = getConfig();
  const voice = voiceOverride || ttsVoice;

  const response = await fetch(`${ttsBaseUrl || 'https://api.fish.audio'}/v1/tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ttsApiKey}`,
      'Content-Type': 'application/json',
      model: ttsModel || 's2.1-pro-free',
    },
    body: JSON.stringify({
      text,
      ...(voice ? { reference_id: voice } : {}),
      format: 'mp3',
      mp3_bitrate: 64,
      // Normalising expands digits and abbreviations into words before they
      // are spoken, which is the difference between hearing "خمسة" and hearing
      // the numeral read out character by character.
      normalize: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Fish Audio refused: ${response.status} ${await response.text()}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  logSpoken('fish', ttsModel || 's2.1-pro-free', text.length, audio.byteLength, 0);
  return { audio: audio.toString('base64'), mime: 'audio/mpeg' };
}

async function speakWithOpenAI(text: string, voiceOverride?: string): Promise<Spoken> {
  const { ttsApiKey, ttsBaseUrl, ttsModel, ttsVoice } = getConfig();

  const client = new OpenAI({
    apiKey: ttsApiKey,
    ...(ttsBaseUrl ? { baseURL: ttsBaseUrl } : {}),
  });

  const response = await client.audio.speech.create({
    model: ttsModel || 'gpt-4o-mini-tts',
    voice: voiceOverride || ttsVoice || 'alloy',
    input: text,
    // mp3 because every Android build plays it without a codec question, and
    // the file is small enough that a better format buys nothing here.
    response_format: 'mp3',
    // Numbers are the point of these replies. A shade under natural is the
    // difference between hearing خمسة عشر and hearing خمسين.
    speed: 0.95,
  });

  const audio = Buffer.from(await response.arrayBuffer());
  logSpoken(
    'openai',
    ttsModel || 'gpt-4o-mini-tts',
    text.length,
    audio.byteLength,
    (text.length * USD_PER_MILLION_CHARS) / 1_000_000
  );

  return { audio: audio.toString('base64'), mime: 'audio/mpeg' };
}

/** What that line cost to say, so a bill is never a surprise. */
function logSpoken(provider: string, model: string, chars: number, bytes: number, usd: number) {
  console.log(
    JSON.stringify({
      level: 'INFO',
      message: 'Spoke a reply',
      provider,
      model,
      chars,
      bytes,
      usd: Math.round(usd / 0.0001) * 0.0001,
    })
  );
}

/**
 * Turns a recording into words.
 *
 * This is the whole reason for recording rather than listening live: Android's
 * recogniser hears in sessions, ends them at every silence, and loses whatever
 * was mid-word when it did. A file has no sessions. It is transcribed once,
 * whole, by a model that was given the entire sentence — pauses, hesitation and
 * all — and that is the difference between an assistant that works and one that
 * has to be fought.
 *
 * Fish detects the language itself and handles a sentence that switches
 * between Derja and French mid-way, which is how this shop actually speaks.
 */
export async function transcribe(audio: Buffer, mime: string): Promise<string> {
  const { sttApiKey, sttBaseUrl, sttLanguage } = getConfig();
  if (!sttApiKey) throw new Error('STT_API_KEY is not configured for this stage');

  const form = new FormData();
  // Copied into a plain ArrayBuffer: a Node Buffer is a view onto a shared
  // pool, and handing that straight to Blob types as the wrong thing.
  const bytes = new Uint8Array(audio.byteLength);
  bytes.set(audio);
  form.append('audio', new Blob([bytes], { type: mime }), 'order.m4a');
  // Left unset the model detects it, which is what a sentence carrying both
  // Arabic and French needs.
  if (sttLanguage) form.append('language', sttLanguage);
  // Timestamps are for subtitles. Nothing here needs to know when a word was
  // said, only what it was.
  form.append('ignore_timestamps', 'true');

  const response = await fetch(`${sttBaseUrl || 'https://api.fish.audio'}/v1/asr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sttApiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Transcription refused: ${response.status} ${await response.text()}`);
  }

  const heard = (await response.json()) as { text?: string; duration?: number };
  const seconds = heard.duration ?? 0;

  console.log(
    JSON.stringify({
      level: 'INFO',
      message: 'Heard a recording',
      bytes: audio.byteLength,
      seconds: Math.round(seconds * 10) / 10,
      chars: heard.text?.length ?? 0,
      // Their published rate, so a month of talking is never a surprise.
      usd: Math.round(((seconds / 60) * 0.006) / 0.0001) * 0.0001,
    })
  );

  return (heard.text ?? '').trim();
}

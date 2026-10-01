import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getConfig } from './config';

/**
 * Reads an order out of a sentence spoken the way the shop speaks.
 *
 * This file does one thing: turn Tunisian Arabic into a structured reading of
 * what was asked for. It resolves nothing and writes nothing — the names it
 * returns are the names as spoken, and matching them to real clients, drivers
 * and stock is the caller's job. Keeping it that way means the model never
 * invents an id for a client who does not exist.
 */

/**
 * Where the order stands right now, as the phone knows it.
 *
 * Without this the model is answering blind: it composes its reply before the
 * server has matched a single name, so it cannot know whether the buyer was
 * found, which address was chosen, or what is still wanting. It guesses, and
 * the guesses read as facts. Sent on every turn so the conversation can
 * actually continue rather than restart.
 */
export interface DraftState {
  client: string | null;
  /** True while the buyer named is not on the books yet. */
  clientIsNew?: boolean;
  clientPhone?: string | null;
  items: { code: string; quantity: number }[];
  address: string | null;
  driver: string | null;
}

/** One turn of the conversation, as the shop and the assistant said it. */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/** What the model is allowed to hand back. Nothing here is trusted as an id. */
export interface DarijaReading {
  /**
   * What to say back, in the shop's own language.
   *
   * Spoken aloud on the phone, so it is written to be heard rather than read:
   * short, no lists, no punctuation that means nothing out loud.
   */
  reply: string;
  /** The buyer, written as it was said. Null when the sentence names nobody. */
  clientSpoken: string | null;
  /**
   * The same name in Latin letters, because that is how the shop's client list
   * is written. Null when the name was already said in Latin.
   */
  clientSpokenLatin: string | null;
  /**
   * The buyer's number and card, when the note carries them.
   *
   * A number identifies a person where a name does not: fifteen clients here
   * are called Mohamed and none of them share a phone. It is also half of what
   * is needed to add him if he turns out to be new.
   */
  clientPhone: string | null;
  clientCin: string | null;
  items: {
    /** A code from the catalogue given to the model, never invented. */
    code: string;
    quantity: number;
    /** The words that produced this line, so a wrong guess can be seen. */
    spoken: string;
    /**
     * The price agreed out loud for this article, tax included.
     *
     * What is said at the counter — "نبيعهالو بـ 85" — and null when the
     * sentence names no price, which is most of the time.
     */
    price: number | null;
  }[];
  /** Things asked for that match nothing in the catalogue. */
  unknownItems: string[];
  transporterSpoken: string | null;
  /** As above: the driver list is written in Latin letters too. */
  transporterSpokenLatin: string | null;
  /**
   * The driver's number and lorry plate when they are given.
   *
   * A driver written down with his number and plate is usually one the shop
   * has not recorded yet, and those two lines are exactly what is needed to
   * add him. Dropping them would mean typing them again.
   */
  transporterPhone: string | null;
  transporterPlate: string | null;
  transporterCin: string | null;
  /** Dinars. See the note on money in the prompt below. */
  transportCost: number | null;
  address: string | null;
  /**
   * A round with more than one drop.
   *
   * One lorry, several gates. Each drop carries its own address and the part
   * of the load that comes off there; anything not assigned to a drop stays on
   * the order as a whole.
   */
  stops: {
    label: string | null;
    address: string;
    items: { code: string; quantity: number }[];
  }[];
  notes: string | null;
  /** YYYY-MM-DD, only when a date was actually said. */
  documentDate: string | null;
  /** Anything the model wants the human to look at twice. */
  warnings: string[];
  /**
   * A question with ready answers, when one would save typing.
   *
   * Only what the model alone can decide belongs here — "with a driver or
   * without?" The things the server knows for certain, like which Mohamed
   * matched or what is short on the shelf, are turned into cards by the server
   * rather than asked for, because a model guessing at a fact it was never
   * given is how a wrong client ends up on an invoice.
   */
  question: { text: string; options: string[] } | null;
}

/** One line of the catalogue as the model sees it. */
export interface CatalogueLine {
  code: string;
  fr: string;
  ar: string;
  /** What is actually on the shelf, so the reply can say when it is short. */
  stock?: number;
  /** What the shop calls it out loud. Often the only name a customer uses. */
  aliases?: string[];
}

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reply',
    'clientSpoken',
    'clientSpokenLatin',
    'clientPhone',
    'clientCin',
    'items',
    'unknownItems',
    'transporterSpoken',
    'transporterSpokenLatin',
    'transporterPhone',
    'transporterPlate',
    'transporterCin',
    'transportCost',
    'address',
    'stops',
    'notes',
    'documentDate',
    'warnings',
    'question',
  ],
  properties: {
    reply: { type: 'string' },
    clientSpoken: { type: ['string', 'null'] },
    clientSpokenLatin: { type: ['string', 'null'] },
    clientPhone: { type: ['string', 'null'] },
    clientCin: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'quantity', 'spoken'],
        properties: {
          code: { type: 'string' },
          quantity: { type: 'number' },
          spoken: { type: 'string' },
        },
      },
    },
    unknownItems: { type: 'array', items: { type: 'string' } },
    transporterSpoken: { type: ['string', 'null'] },
    transporterSpokenLatin: { type: ['string', 'null'] },
    transporterPhone: { type: ['string', 'null'] },
    transporterPlate: { type: ['string', 'null'] },
    transporterCin: { type: ['string', 'null'] },
    transportCost: { type: ['number', 'null'] },
    address: { type: ['string', 'null'] },
    stops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'address', 'items'],
        properties: {
          label: { type: ['string', 'null'] },
          address: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['code', 'quantity'],
              properties: { code: { type: 'string' }, quantity: { type: 'number' } },
            },
          },
        },
      },
    },
    notes: { type: ['string', 'null'] },
    documentDate: { type: ['string', 'null'] },
    warnings: { type: 'array', items: { type: 'string' } },
    question: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['text', 'options'],
      properties: {
        text: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

/**
 * The standing instructions. Everything in here is true of the shop rather
 * than of any one order, so it is the same on every call and can be cached.
 */
/**
 * What the order looks like at this moment, written for the model to read.
 *
 * Required and optional are marked apart because they mean different things to
 * say out loud: a missing address stops the order existing, a missing driver is
 * just a delivery nobody is carrying yet.
 */
function standing(state: DraftState | null): string {
  if (!state) return '';

  const lines = state.items.length
    ? state.items.map((i) => `${i.quantity} × ${i.code}`).join(', ')
    : 'nothing yet';

  const wanting: string[] = [];
  if (!state.client) wanting.push('the buyer (required)');
  if (state.items.length === 0) wanting.push('at least one article (required)');
  if (!state.address) wanting.push('a delivery address (required)');
  if (!state.driver) wanting.push('a driver (optional — an order can exist without one)');
  if (state.clientIsNew && !state.clientPhone) {
    wanting.push("the new buyer's phone number (ask for it — a client with no number cannot be telephoned about his own delivery, and is the one who gets lost among the fifteen Mohameds later)");
  }

  return `

# Where this order stands right now
Buyer: ${state.client ?? 'not settled'}
Articles: ${lines}
Delivery address: ${state.address ?? 'not chosen'}
Driver: ${state.driver ?? 'none'}
Still wanting: ${wanting.length ? wanting.join('; ') : 'nothing — it is ready'}

This is the truth of the order, not your memory of it. The shop has been
correcting it on screen between your answers, so a quantity here that differs
from what was said earlier means the shop changed it deliberately — take it as
it is and do not argue with it or offer to put it back.

Speak from this. When something required is wanting, say which — all of them,
in one breath, not one per turn: "مازال ناقص العنوان والشوفور" rather than
asking about the address, waiting, then asking about the driver. Mention the
driver as a thing that can be left out, never as a thing that is blocking.
When nothing is wanting, say so plainly and stop asking.`;
}

function systemPrompt(catalogue: CatalogueLine[], today: string, state: DraftState | null): string {
  const lines = catalogue
    .map(
      (p) =>
        `${p.code} | ${p.fr} | ${p.ar}` +
        (p.stock !== undefined ? ` | in stock: ${p.stock}` : '') +
        (p.aliases?.length ? ` | also called: ${p.aliases.join(', ')}` : '')
    )
    .join('\n');

  return `Your name is Yahya. You read orders for Dar El Khir, a wholesale shop in Tunisia. The owner or a counter hand types or dictates what a customer is buying, in the way they would say it out loud, and you write down what they meant.

You do not create anything. You report what the sentence says. A human checks your reading before any order exists.

# Two shapes of input
It arrives either as a sentence said out loud, or as a written list. Both are
normal and both mean the same thing. A written one looks like this:

    Mokhtar Khlifi
    +21620123456
    Zaghouan
    CGDT20 x 5
    FB x 12
    Chauffeur:
    ALI
    +21620123456
    123 TN 4567
    Zaghouan

There the codes are the catalogue's own codes, the first line is the buyer, and
what follows "Chauffeur" is the driver with his number, his lorry plate and
where the load is going. Read a list exactly as carefully as a sentence; take
the codes at face value when they are catalogue codes, and never invent one.

# Some of this is dictated, and dictation mangles the exact parts
The text may come from a phone's speech recognition rather than a keyboard. It
transcribes ordinary words well and is unreliable on precisely the things that
have to be exact — codes, numbers, plates. Expect and repair:

- Codes spelled out or spaced: "C G D T 20", "cgdt vingt", "سي جي دي تي عشرين",
  "ces gé dé té 20" all mean CGDT20. Letters said one by one belong together.
- A code heard as words: "T P 7", "té pé sept" is TP7.
- Phone numbers as words or in groups: "vingt un six, vingt, cent vingt trois",
  "+216 20 123 456", "٢٠ ١٢٣ ٤٥٦" — return the digits.
- Plates: "cent vingt trois TN quatre mille cinq cent soixante sept" is
  "123 TN 4567". Tunisian plates are digits, then TN or TU, then digits.
- Quantities said before or after the article, either order.

Repair these when the reading is clear. When you had to reconstruct a code, a
number or a plate rather than read it plainly, add a warning saying so and
quote what you started from — the shop can glance at a code it can see was
guessed, and cannot glance at one it cannot.

# The language
The sentence is Tunisian Arabic (Derja). It arrives in either script, often mixed with French, and often mixed within a single sentence:
- Arabic script: "عندي زوز شبكة لسي فتحي"
- Latin/Arabizi, where digits stand in for letters: 3=ع, 7=ح, 9=ق, 5=خ, 2=ء. "3andi zouz chabka l si Fathi"
Both are the same language. Read either.

Numbers arrive as Derja words, French words, or digits, and are mixed freely:
- واحد/wahed 1, زوز/zouz 2, ثلاثة/tlatha 3, أربعة/arb3a 4, خمسة/khamsa 5,
  ستة/setta 6, سبعة/sab3a 7, ثمانية/thmanya 8, تسعة/tes3a 9, عشرة/3achra 10,
  خمستاش 15, عشرين 20, ثلاثين 30, خمسين 50, مية/mya 100, ميتين 200, ألف/alf 1000
- "cinquante", "cent", "deux cents" are ordinary here too.

# Money — read this carefully
Tunisians quote prices in thousands of millimes out loud. "خمسين ألف" / "khamsin alf" / "cinquante mille" spoken at this counter means **50 dinars**, not 50000. The same for "مية ألف" = 100 dinars.
Report money in dinars. When a spoken amount could plausibly be read either way, still give your best reading, and add a warning saying which reading you took. Never silently pick one.

# The catalogue
These are the only articles this shop sells. Match what was asked for to one of these codes. The name a customer uses is rarely the catalogue name — "شبكة"/"chabka"/"grillage" is fencing mesh, "فيل"/"fil"/"سلك" is wire.

The "also called" words are what the shop and its customers actually say. They are the most reliable way to match, more so than the formal name.

CODE | French name | Arabic name | in stock | what it is called
${lines}

If something was asked for that is not on this list, do not force it onto the nearest code. Put the words in unknownItems and leave it out of items.

# Talking back
You are not a form. The shop talks to you and you answer, in one or two short
sentences, in the language they used. Answer to your name when it is used —
"يا يحيى" is someone getting your attention, not part of the order — and do not
repeat it back at the start of every answer; a person who is spoken to does not
introduce himself each time.

Answer — Derja in Arabic script if they spoke
Arabic, French if they spoke French.

Your answer is read aloud by the phone, so write it to be heard: no lists, no
bullet points, no code, no punctuation that means nothing spoken.

Say what you understood, and be specific about the numbers: "خمسة شبكة 20 لخالد
برقاوي" is a good answer because the shop can hear whether you got it wrong.

Say what is short. You are given what is on the shelf: if five were asked for
and there are four, say so plainly.

Ask when something is missing or unclear — no quantity, a name you cannot place,
two articles it might be — and ask about one thing at a time, the way a person
would. Do not ask about what does not matter; a missing driver is not a
question, it is just a delivery without one.

Never say an order was created. You cannot create anything and the shop presses
that button itself.

# What to return
- reply: that answer.
- clientSpoken: the buyer's name exactly as said, with the politeness stripped — "لسي فتحي الصالحي" gives "فتحي الصالحي". Null if no buyer is named.
- clientSpokenLatin: the same name in Latin letters, spelled the Tunisian way — محمد is Mohamed, خالد is Khaled, فتحي is Fathi, عبد الرؤوف is Abed Erraouf, صالحي is Salhi. This matters: the shop's client list is written in Latin letters, so an Arabic name alone finds nobody.
  Drop the definite article: "الفتحي" is Fathi, not El Fathi. Tunisian family names ending in ي take an i, not an e — صالحي is Salhi and not Saleh, رتيبي is Rtibi. Getting that ending wrong is the difference between finding a man and inviting the shop to add him a second time.
  Null only when the name was already said in Latin.
- clientPhone: the buyer's number if the note carries one, digits as written. Null otherwise.
- clientCin: the buyer's card number, or his matricule fiscal if he buys as a business. Null otherwise.
- items: one entry per article, with a catalogue code, a quantity, the words that produced it, and the price if one was named.
- a line's price is what was agreed out loud for that article, tax included, per unit — "نبيعهالو بـ 85", "à 85 le rouleau", "b 4 dinar el kilo". It is a price per unit, never the line total: "5 chabka b 85" is five at 85 each. The millimes rule above applies here too, so "بـ 85 ألف" is 85 dinars. Null when no price was named, which is most of the time.
- stops: a round with more than one drop. "زوز لثالة وثلاثة لفوسانة" is two of that article at Thala and three at Foussana. Give each drop its address and the part of the load that comes off there. Leave the list empty when everything goes to one place — which is the normal case; do not invent a round out of a single address.
- transporterPhone: the driver's number if one is given, digits as written. Null otherwise.
- transporterPlate: the lorry plate if one is given — "123 TN 4567". Null otherwise.
- transporterSpokenLatin: the driver's name in Latin letters, for the same reason. Null when it was already Latin.
- transporterSpoken: the driver or lorry owner, if one is named. A sentence often names both a buyer and a driver — "لفتحي مع الشوفور منعم" is Fathi buying, Monem driving. Null if no driver is mentioned.
- transportCost: what the customer is charged for delivery, in dinars. Null if not mentioned.
- address: where it is going, as said. Null if not mentioned.
- documentDate: ${today} is today. Only fill this when a date is actually said — "اليوم" is today, "البارح" is yesterday. Null otherwise.
- notes: anything said that belongs on the order but fits nowhere above. Null if there is none.
- question: when your answer ends in a question the shop could answer with a tap, put it here with two to four ready answers in their language — {"text": "بالشوفور ولا بلاش؟", "options": ["بالشوفور", "بلاش"]}. Null when you are not asking, or when the answer is a number or a name that has to be said rather than picked.
- warnings: your own doubts, in French, for the person checking. Write one whenever a quantity could be read two ways, a name is unclear, an amount is ambiguous, or an article was guessed rather than clearly said. An empty list means you are confident.

Do not guess a quantity that was not said. If someone asks for "شبكة" with no number, report quantity 1 and add a warning that no quantity was given.`;
}

/**
 * Fills in what a provider without strict mode may have left out.
 *
 * Plain JSON mode promises JSON and nothing about its shape, so a missing key
 * is normal rather than exceptional. Absent is read as "nothing was said",
 * which is what the caller already handles — the alternative is a crash on a
 * field the sentence never mentioned.
 */
export function normaliseReading(r: Partial<DarijaReading>): DarijaReading {
  return {
    reply: typeof r.reply === 'string' && r.reply.trim() ? r.reply.trim() : '',
    clientSpoken: r.clientSpoken ?? null,
    clientSpokenLatin: r.clientSpokenLatin ?? null,
    clientPhone: r.clientPhone ?? null,
    clientCin: r.clientCin ?? null,
    items: (r.items ?? [])
      .filter((i) => i && typeof i.code === 'string')
      .map((i) => ({ ...i, price: typeof i.price === 'number' ? i.price : null })),
    unknownItems: r.unknownItems ?? [],
    transporterSpoken: r.transporterSpoken ?? null,
    transporterSpokenLatin: r.transporterSpokenLatin ?? null,
    transporterPhone: r.transporterPhone ?? null,
    transporterPlate: r.transporterPlate ?? null,
    transporterCin: r.transporterCin ?? null,
    transportCost: r.transportCost ?? null,
    address: r.address ?? null,
    // A provider without strict mode may omit the round entirely, and no round
    // is the ordinary case anyway.
    stops: (r.stops ?? []).filter((st) => st && typeof st.address === 'string' && st.items?.length),
    notes: r.notes ?? null,
    documentDate: r.documentDate ?? null,
    warnings: r.warnings ?? [],
    question:
      r.question && typeof r.question.text === 'string' && r.question.options?.length
        ? { text: r.question.text, options: r.question.options.slice(0, 4) }
        : null,
  };
}

/** Tokens and money for one reading, logged so a test budget is not a mystery. */
function logUsage(
  provider: string,
  model: string,
  input: number,
  output: number,
  cached: number,
  chars: number,
  usdPerMillionIn: number,
  usdPerMillionOut: number
) {
  console.log(
    JSON.stringify({
      level: 'INFO',
      message: 'Darija reading',
      provider,
      model,
      input,
      output,
      cached,
      usd:
        Math.round(
          ((input * usdPerMillionIn + output * usdPerMillionOut) / 1_000_000) * 10_000
        ) / 10_000,
      chars,
    })
  );
}

/**
 * Sends one sentence to whichever model the stage is configured for.
 *
 * The prompt and the schema above are the same either way — they describe the
 * shop, not a vendor — so switching provider is a setting rather than a
 * rewrite. Throws on failure rather than returning a half-empty order: a
 * counter hand told "I could not read that" will type it again, but one handed
 * a silently emptied basket will not notice.
 */
export async function readOrderFromDarija(
  text: string,
  catalogue: CatalogueLine[],
  today: string,
  history: Turn[] = [],
  state: DraftState | null = null
): Promise<DarijaReading> {
  const { aiProvider, aiModel, anthropicApiKey, openaiApiKey } = getConfig();
  const system = systemPrompt(catalogue, today, state);

  if (aiProvider === 'openai') {
    if (!openaiApiKey) throw new Error('OPENAI_API_KEY is not configured for this stage');
    return readWithOpenAI(text, system, aiModel || 'gpt-4.1', openaiApiKey, history);
  }

  if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not configured for this stage');
  return readWithAnthropic(text, system, aiModel || 'claude-opus-5', anthropicApiKey, history);
}

async function readWithAnthropic(
  text: string,
  system: string,
  model: string,
  apiKey: string,
  history: Turn[]
): Promise<DarijaReading> {
  const { anthropicWorkspaceId } = getConfig();
  // An identity-linked key — one made against a person rather than the
  // organisation — is refused outright unless the call says which workspace it
  // acts in. An ordinary key neither needs nor minds the header, so it is sent
  // whenever we have been given one.
  const client = new Anthropic({
    apiKey,
    ...(anthropicWorkspaceId
      ? { defaultHeaders: { 'anthropic-workspace-id': anthropicWorkspaceId } }
      : {}),
  });

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    // The instructions and the catalogue are the same on every call, so they
    // are the cacheable half of the request and the sentence goes after them.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    thinking: { type: 'adaptive' },
    // The gateway in front of this Lambda gives up at 30 seconds, and a
    // counter hand is waiting. Medium is the most thinking that reliably fits.
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    // The whole exchange, so "زيد زوز أخرى" means two more of what was just
    // discussed rather than two of nothing.
    messages: [
      ...history.map((t) => ({ role: t.role, content: t.text })),
      { role: 'user' as const, content: text },
    ],
  });

  const u = response.usage;
  logUsage(
    'anthropic',
    response.model,
    u.input_tokens,
    u.output_tokens,
    u.cache_read_input_tokens ?? 0,
    text.length,
    5,
    25
  );

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to read that sentence');
  }

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('The model returned no reading');

  return JSON.parse(block.text) as DarijaReading;
}

async function readWithOpenAI(
  text: string,
  system: string,
  model: string,
  apiKey: string,
  history: Turn[]
): Promise<DarijaReading> {
  const { aiBaseUrl, aiJsonMode } = getConfig();
  // Groq, Gemini, OpenRouter and the rest answer the same protocol, so a
  // different provider is a base URL rather than another client.
  const client = new OpenAI({ apiKey, ...(aiBaseUrl ? { baseURL: aiBaseUrl } : {}) });

  // Strict schema where the provider supports it. Where it does not — which is
  // most of the free tiers — the shape is spelled out in the prompt instead and
  // the answer is checked when it arrives, because plain JSON mode guarantees
  // only that it is JSON.
  const strict = aiJsonMode === 'schema';
  const instructions = strict
    ? system
    : `${system}\n\n# The answer\nReply with JSON and nothing else — no prose, no code fence. Exactly this shape, every key present, using null where there is nothing:\n${JSON.stringify(SCHEMA, null, 2)}`;

  const response = await client.chat.completions.create({
    model,
    response_format: strict
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'order_reading',
            strict: true,
            schema: SCHEMA as unknown as Record<string, unknown>,
          },
        }
      : { type: 'json_object' },
    max_completion_tokens: 8000,
    messages: [
      { role: 'system', content: instructions },
      ...history.map((t) => ({ role: t.role, content: t.text })),
      { role: 'user' as const, content: text },
    ],
  });

  const u = response.usage;
  logUsage(
    'openai',
    response.model,
    u?.prompt_tokens ?? 0,
    u?.completion_tokens ?? 0,
    u?.prompt_tokens_details?.cached_tokens ?? 0,
    text.length,
    2,
    8
  );

  const choice = response.choices[0];
  if (choice?.message?.refusal) {
    throw new Error(`The model declined to read that sentence: ${choice.message.refusal}`);
  }

  const content = choice?.message?.content;
  if (!content) throw new Error('The model returned no reading');

  // A weaker model wraps its JSON in a fence however firmly it is asked not
  // to. Cheap to survive, and the alternative is a failed order for a stray
  // backtick.
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  const parsed = JSON.parse(cleaned) as DarijaReading;

  return normaliseReading(parsed);
}

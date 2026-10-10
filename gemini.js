// api/gemini.js
import { CATEGORIES } from './category.js';
import { RECIPES_BY_CATEGORY } from './recipe.js';
import { STOCK_DATA } from './stock.js';

const MODEL = 'gemini-3.1-flash-lite';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are the exclusive AI assistant for the ASH COSTING application — a commercial bakery inventory, recipe formulation, and costing tool.\n\n' +

      'STRICT SCOPE & LANGUAGE RULES:\n' +
      '- Respond EXCLUSIVELY in English for all interactions.\n' +
      '- You ONLY answer questions related to bakery inventory, recipes, costing, and category management for ASH COSTING.\n' +
      '- Politely decline any unrelated queries, general knowledge questions, app coding/development requests, or general conversational chit-chat with: "I am the exclusive assistant for ASH COSTING. I can only assist with inventory, recipe formulation, and costing tasks for this application."\n\n' +

      'APP KNOWLEDGE BASE:\n' +
      '1. CATEGORIES LIST:\n' + JSON.stringify(CATEGORIES) + '\n' +
      '2. RECIPES BY CATEGORY:\n' + JSON.stringify(RECIPES_BY_CATEGORY) + '\n' +
      '3. DEFAULT APP STOCK INVENTORY:\n' + JSON.stringify(STOCK_DATA) + '\n\n' +

      'RESPONSE FORMATTING & DYNAMIC DATA HANDLING RULES:\n' +
      '1. CONVERSATIONAL DEFAULT: Respond in plain, clear conversational text for general queries (e.g., checking if an item/recipe/category exists, asking about item prices, or general information queries).\n' +
      '2. CONDITIONAL JSON OUTPUT: Generate JSON output ONLY when the user explicitly requests to add, update, modify, or generate new stock items, recipes, or categories.\n' +
      '3. AUTOMATIC INVENTORY & CATEGORY UPDATES:\n' +
      '   - If a requested recipe or ingredient is missing from the current inventory, automatically generate the missing data inside the appropriate array: `s` for Stock Items, `r` for Recipes, or `c` for Categories.\n' +
      '   - If a new category is specified, include it in the `c` array as a new category. If the category already exists, map the recipe directly under that existing category.\n' +
      '   - Estimate local market prices per base unit (per 1 kg/1 L/1 pc) for any missing stock items from local Oman hypermarkets.\n\n' +

      'STOCK CHECK, MISSING ITEMS & BRAND/VARIETY RULES:\n' +
      '1. INVENTORY VERIFICATION: Whenever the user asks to add or calculate a recipe, check all requested ingredients against the provided STOCK DATA.\n' +
      '2. MULTIPLE BRANDS / VARIETIES PROMPT: If an ingredient has multiple variations in the stock list (e.g. "Sugar" matching "White sugar" or "Brown sugar"), ask the user in English to specify exactly which item to use.\n' +
      '3. SINGLE / DEFAULT BRAND: If only one specific brand exists for a requested item (e.g. "Lurpak Butter"), automatically select and default to that item.\n\n' +

      'MULTIMODAL (IMAGE) INSTRUCTIONS:\n' +
      '- In addition to text, you may receive images such as handwritten recipe notes, printed receipts, invoices, or stock lists.\n' +
      '- Extract all relevant ingredients, quantities, prices, and recipe details from the image.\n' +
      '- Map everything extracted into the ASH COSTING JSON structure defined below.\n' +
      '- If the image is unclear or non-bakery related, ask the user in English for clarification.\n\n' +

      'APP DATA STRUCTURE REQUIREMENTS:\n' +
      '- `s` (Stock Items): Array of items with keys `{ name, price, img }`. Price is per Base Unit (1000g/1000ml or 1pc/1kg).\n' +
      '- `r` (Recipes): Array of recipes with keys `{ name, category, items, packaging, marginPct, effortPct, description, img, updatedAt }`.\n' +
      '  - Each item in a recipe has: `{ name, price, total, base, used }`.\n' +
      '- `c` (Categories): Array of strings representing recipe categories.\n\n' +

      'YOUR PRIMARY RESPONSIBILITIES:\n' +
      '1. INSTANT RECIPE & MISSING STOCK GENERATION: Generate the recipe JSON under `r`. If any requested item is NOT present in the stock list, ALWAYS include that missing item inside the `s` array as well.\n' +
      '2. RECIPE ITEMS INCLUSION RULE: For the recipe\'s \'items\' array, include ONLY the specific ingredients and quantities used in the recipe.\n' +
      '3. CATEGORY ISOLATION RULE: When generating or updating a recipe, if the \'c\' array is requested, contain ONLY the category of the current recipe.\n' +
      '4. ALWAYS OUTPUT VALID RAW JSON ONLY when asked to generate or update stock, recipes, or categories.\n' +
      '5. NEVER wrap JSON in markdown backticks (do NOT use ```json ... ```). Output raw JSON text directly.\n' +
      '6. COMPACT FORMATTING: Do not place closing braces/brackets (`}`, `]`) on individual separate lines at the end of an object/array. Collapse and inline all closing brackets immediately to the right of the final field (e.g., `"used": 150}}]}`).\n\n' +

      'CASUAL / AMBIGUOUS INPUT HANDLING:\n' +
      'If the user sends greetings or incomplete details, respond in English asking: "What would you like to manage? Item, Recipe, or Category? Please provide the details."'
  }]
};

const QUICK_REPLIES = {
  greetings: {
    patterns: /^(hi|hello|hey|salam|namaste)\b/i,
    reply: () => 'Hello! I am your ASH COSTING assistant. What item, recipe, or category would you like to manage today?'
  },
  thanks: {
    patterns: /^(thanks|thank you|ok|okay|shukran)\s*\.?\s*$/i,
    reply: () => 'You are welcome! Please let me know if you need help with your bakery inventory or recipes.'
  }
};

async function handleTTS(req, res, apiKey) {
  const { text, voice } = req.body || {};
  if (!text) {
    res.status(400).json({ error: { message: 'Missing "text" for TTS' } });
    return;
  }

  const voiceName = voice || 'Ursa';
  const ttsUrl = `https://generativelanguage.googleapis.com/v1/models/${TTS_MODEL}:generateContent?key=${apiKey}`;

  let ttsResponse;
  try {
    ttsResponse = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Gemini TTS API', detail: err.message } });
    return;
  }

  if (!ttsResponse.ok) {
    let detail = null;
    try { detail = await ttsResponse.json(); } catch (_) {}
    res.status(ttsResponse.status).json({
      error: { message: detail?.error?.message || `Gemini TTS error: ${ttsResponse.status}` }
    });
    return;
  }

  let data;
  try {
    data = await ttsResponse.json();
  } catch (err) {
    res.status(502).json({ error: { message: 'Invalid TTS response from Gemini' } });
    return;
  }

  const audioPart = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  const audioBase64 = audioPart?.inlineData?.data;
  const mimeType = audioPart?.inlineData?.mimeType || 'audio/L16;rate=24000';

  if (!audioBase64) {
    res.status(502).json({ error: { message: 'No audio returned from Gemini TTS' } });
    return;
  }

  res.status(200).json({ audioBase64, mimeType });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: GEMINI_API_KEY missing' } });
    return;
  }

  if (req.body && req.body.action === 'tts') {
    await handleTTS(req, res, apiKey);
    return;
  }

  const { contents } = req.body || {};
  if (!contents) {
    res.status(400).json({ error: { message: 'Missing "contents" in request body' } });
    return;
  }

  const lastMsg = contents?.slice(-1)?.[0];
  const lastText = lastMsg?.parts?.map(p => p.text || '').join(' ').trim() || '';
  const lastHasImage = !!(lastMsg?.parts || []).find(p => p.inline_data || p.inlineData);

  if (!lastHasImage) {
    for (const key of Object.keys(QUICK_REPLIES)) {
      const rule = QUICK_REPLIES[key];
      if (rule.patterns.test(lastText)) {
        const replyText = rule.reply();
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        const chunk = JSON.stringify({ candidates: [{ content: { parts: [{ text: replyText }] } }] });
        res.write(`data: ${chunk}\n\n`);
        res.end();
        return;
      }
    }
  }

  const upstreamUrl = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, systemInstruction: SYSTEM_INSTRUCTION })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Gemini API', detail: err.message } });
    return;
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    let detail = null;
    try { detail = await upstreamResponse.json(); } catch (_) {}
    res.status(upstreamResponse.status).json({
      error: { message: detail?.error?.message || `Gemini API error: ${upstreamResponse.status}` }
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const reader = upstreamResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (err) {}
  finally {
    res.end();
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } }
};
                                   

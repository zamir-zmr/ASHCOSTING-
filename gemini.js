// gemini.js — CLIENT-SIDE version (no backend / no /api folder needed)
// Bot ke fetch('/api/gemini') calls ko intercept karke seedha Gemini API ko call karta hai.
// Load order (ash-ai-bot.html): category.js, recipe.js, stock.js, gemini.js
(function () {
  // ====== API KEY ======
  // Yahan apni key paste karein, ya khali chhodein — tab bot khud ek input box dikhayega
  // aur key phone ke localStorage me save kar lega.
  var GEMINI_API_KEY = '';

  var MODEL = 'gemini-3.1-flash-lite';
  var TTS_MODEL = 'gemini-2.5-flash-preview-tts';
  var BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

  var SYSTEM_INSTRUCTION = {
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

var QUICK_REPLIES = {
  greetings: {
    patterns: /^(hi|hello|hey|salam|namaste)\b/i,
    reply: () => 'Hello! I am your ASH COSTING assistant. What item, recipe, or category would you like to manage today?'
  },
  thanks: {
    patterns: /^(thanks|thank you|ok|okay|shukran)\s*\.?\s*$/i,
    reply: () => 'You are welcome! Please let me know if you need help with your bakery inventory or recipes.'
  }
};


  function jsonResp(status, obj) {
    return new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json' } });
  }

  function getKey() {
    if (GEMINI_API_KEY) return Promise.resolve(GEMINI_API_KEY);
    var k = '';
    try { k = localStorage.getItem('ash_gemini_key') || ''; } catch (e) {}
    if (k) return Promise.resolve(k);
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;';
      ov.innerHTML = '<div style="background:#1e293b;color:#fff;border-radius:14px;padding:18px;width:100%;max-width:420px;font:600 14px sans-serif;">' +
        '<div style="margin-bottom:10px;">Gemini API Key daalein</div>' +
        '<input id="ashKeyIn" type="password" placeholder="AIza..." style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:none;font-size:15px;">' +
        '<button id="ashKeyOk" style="margin-top:12px;width:100%;padding:12px;border:none;border-radius:10px;background:#fb923c;color:#fff;font:700 15px sans-serif;">Save</button></div>';
      document.body.appendChild(ov);
      ov.querySelector('#ashKeyOk').onclick = function () {
        var v = ov.querySelector('#ashKeyIn').value.trim();
        if (!v) return;
        try { localStorage.setItem('ash_gemini_key', v); } catch (e) {}
        ov.remove(); resolve(v);
      };
    });
  }

  async function handleTTS(body, key) {
    if (!body.text) return jsonResp(400, { error: { message: 'Missing "text" for TTS' } });
    var r;
    try {
      r = await _fetch(BASE + TTS_MODEL + ':generateContent?key=' + key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: body.text }] }],
          generationConfig: { responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: body.voice || 'Ursa' } } } }
        })
      });
    } catch (err) { return jsonResp(502, { error: { message: 'Failed to reach Gemini TTS API: ' + err.message } }); }
    var data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) return jsonResp(r.status, { error: { message: (data && data.error && data.error.message) || ('Gemini TTS error: ' + r.status) } });
    var parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    var ap = parts.find(function (p) { return p.inlineData; });
    if (!ap || !ap.inlineData.data) return jsonResp(502, { error: { message: 'No audio returned from Gemini TTS' } });
    return jsonResp(200, { audioBase64: ap.inlineData.data, mimeType: ap.inlineData.mimeType || 'audio/L16;rate=24000' });
  }

  async function handleChat(body, key) {
    var contents = body.contents;
    if (!contents) return jsonResp(400, { error: { message: 'Missing "contents" in request body' } });
    var last = contents[contents.length - 1];
    var parts = (last && last.parts) || [];
    var lastText = parts.map(function (p) { return p.text || ''; }).join(' ').trim();
    var hasImg = parts.some(function (p) { return p.inline_data || p.inlineData; });
    if (!hasImg) {
      for (var k in QUICK_REPLIES) {
        if (QUICK_REPLIES[k].patterns.test(lastText)) {
          var chunk = JSON.stringify({ candidates: [{ content: { parts: [{ text: QUICK_REPLIES[k].reply() }] } }] });
          return new Response('data: ' + chunk + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        }
      }
    }
    try {
      var r = await _fetch(BASE + MODEL + ':streamGenerateContent?alt=sse&key=' + key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents, systemInstruction: SYSTEM_INSTRUCTION })
      });
      if (!r.ok) {
        var d = null; try { d = await r.json(); } catch (e) {}
        return jsonResp(r.status, { error: { message: (d && d.error && d.error.message) || ('Gemini API error: ' + r.status) } });
      }
      return r; // SSE stream seedha bot ko
    } catch (err) {
      return jsonResp(502, { error: { message: 'Failed to reach Gemini API: ' + err.message } });
    }
  }

  var _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/gemini') === -1) return _fetch(input, init);
    var body = {};
    try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
    var key = await getKey();
    return body.action === 'tts' ? handleTTS(body, key) : handleChat(body, key);
  };
})();

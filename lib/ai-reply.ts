import { createAdminClient } from '@/services/supabase/admin';
import { callAI } from '@/lib/ai-client';

type AdminClient = ReturnType<typeof createAdminClient>;

// Shared by the WhatsApp webhook (production auto-reply) and the Knowledge Base
// "Test Agent Reply" sandbox, so both paths run identical retrieval + prompting
// logic and never drift apart.

export async function categorizeMessage(content: string): Promise<string | null> {
  if (content.length < 10) return null;

  try {
    const label = await callAI(
      [
        {
          role: 'system',
          content:
            'Categorize this customer message into exactly ONE of these labels: billing, support, sales, complaint, inquiry, spam, general. Reply with ONLY the label word.',
        },
        { role: 'user', content },
      ],
      { model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free', maxTokens: 10, temperature: 0 },
    );
    const lower = label?.toLowerCase().trim();
    const validLabels = ['billing', 'support', 'sales', 'complaint', 'inquiry', 'spam', 'general'];
    return validLabels.includes(lower ?? '') ? lower! : null;
  } catch {
    return null;
  }
}

// Knowledge-base relevance threshold for the AI agent's reply context. Below this,
// retrieved chunks are noise more often than not and confuse the model into blending
// unrelated facts (see project-ai-agent-accuracy memory for the investigation).
export const KB_MIN_SIMILARITY = 0.45;

export function dedupeChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export async function fetchKnowledgeBaseContext(
  supabase: AdminClient,
  workspaceId: string,
  query: string,
): Promise<string> {
  try {
    const db = supabase as any;

    // Try semantic vector search first (pgvector)
    try {
      const { generateEmbedding, formatEmbedding } = await import('@/lib/embeddings');
      const queryEmbedding = await generateEmbedding(query);
      if (queryEmbedding) {
        const formattedEmbedding = formatEmbedding(queryEmbedding);

        // Search both knowledge_base entries AND uploaded file chunks (vector_documents)
        // Always combine both — never early-return on just one source
        const contextParts: string[] = [];

        const { data: vecResults } = await db.rpc('match_knowledge_base', {
          query_embedding: formattedEmbedding,
          workspace_id_param: workspaceId,
          match_count: 5,
          min_similarity: KB_MIN_SIMILARITY,
        });
        if (vecResults?.length > 0) {
          contextParts.push(
            ...dedupeChunks(
              (vecResults as Array<{ title: string; content: string }>)
                .map((e) => `## ${e.title}\n${e.content}`)
            )
          );
        }

        // Semantic search in uploaded file chunks (requires embeddings)
        const { data: vecDocResults } = await (db.rpc('match_vector_documents', {
          query_embedding: formattedEmbedding,
          workspace_id_param: workspaceId,
          match_count: 10,
          min_similarity: KB_MIN_SIMILARITY,
        }) as Promise<{ data: Array<{ filename: string; content: string }> | null }>).catch(() => ({ data: null }));

        if (vecDocResults?.length) {
          contextParts.push(
            ...dedupeChunks(
              (vecDocResults as Array<{ filename: string; content: string }>)
                .map((r) => `[${r.filename}] ${r.content}`)
            )
          );
        }

        if (contextParts.length > 0) {
          return contextParts.join('\n\n');
        }
      }
    } catch {
      // pgvector function not yet created — fall through to keyword search
    }

    // Direct scan of vector_documents — guarantees uploaded files are included even if
    // embeddings are null (silent embedding failure during upload). Always runs as safety
    // net, but only for chunks that actually mention a query keyword — otherwise a workspace
    // with many uploaded docs would dump everything into the prompt regardless of relevance.
    try {
      const { data: directDocs } = await (db
        .from('vector_documents')
        .select('filename, content, chunk_index')
        .eq('workspace_id', workspaceId)
        .order('filename')
        .order('chunk_index')
        .limit(200) as Promise<{ data: Array<{ filename: string; content: string; chunk_index: number }> | null }>);

      const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const matching = (directDocs ?? []).filter((row) => {
        if (queryWords.length === 0) return true;
        const lower = row.content.toLowerCase();
        return queryWords.some((w) => lower.includes(w));
      }).slice(0, 40);

      if (matching.length) {
        const byFile = new Map<string, string[]>();
        for (const row of matching) {
          const arr = byFile.get(row.filename) ?? [];
          arr.push(row.content);
          byFile.set(row.filename, arr);
        }
        const directContext = Array.from(byFile.entries())
          .map(([fn, chunks]) => `[${fn}]\n${dedupeChunks(chunks).join(' ')}`)
          .join('\n\n');
        return directContext;
      }
    } catch { /* table may not exist yet */ }

    // Fallback: keyword scoring on knowledge_base table entries
    const { data: entries } = await db
      .from('knowledge_base')
      .select('title, content, tags, priority')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .eq('is_draft', false)
      .order('priority', { ascending: false })
      .limit(20);

    if (!entries || entries.length === 0) return '';

    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const scored = (entries as Array<{ title: string; content: string; tags?: string[]; priority?: number }>).map((e) => {
      const titleLower = e.title.toLowerCase();
      const contentLower = e.content.toLowerCase();
      const tagsText = (e.tags ?? []).join(' ').toLowerCase();
      let score = (e.priority ?? 0) * 0.1;
      for (const w of queryWords) {
        if (titleLower.includes(w)) score += 3;
        else if (tagsText.includes(w)) score += 2;
        else if (contentLower.includes(w)) score += 1;
      }
      return { title: e.title, content: e.content, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter((e) => e.score > 0 || entries.length <= 5)
      .map((e) => `## ${e.title}\n${e.content}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

// ── Parse BUTTON "Label" → response definitions from persona text ──────────
export function parseButtonResponses(persona: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of persona.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^BUTTON\b/i.test(trimmed)) continue;
    // Accept BUTTON "Label", BUTTON 'Label', BUTTON: "Label", and BUTTON "Label": variants
    const labelMatch = /^BUTTON\s*:?\s*["']([^"']+)["']\s*:?/i.exec(trimmed);
    if (!labelMatch?.[1]) {
      console.warn('[parseButtonResponses] Unparsed BUTTON line in persona:', trimmed);
      continue;
    }
    const label = labelMatch[1].trim().toLowerCase();
    // Strip separator after closing quote: any arrows (→ ➡ ➜ ⇒ etc), dashes, colons, spaces
    const rest = trimmed.slice(labelMatch[0].length);
    const response = rest.replace(/^[\s→➡➜⇒❔\-=>:]+/, '').trim();
    if (response) {
      map.set(label, response);
    } else {
      console.warn('[parseButtonResponses] BUTTON line has no response text:', trimmed);
    }
  }
  return map;
}

// ── Extract button label from [Tapped button: "X"] or [Selected: "X"] ──────
export function extractButtonLabel(message: string): string | null {
  const m = /^\[(?:Tapped button|Selected):\s*"([^"]+)"\]$/i.exec(message.trim());
  return m?.[1]?.trim() ?? null;
}

// ── Programmatic language detection — injected into user message so AI cannot ignore ──
export function detectReplyLanguage(text: string): 'english' | 'hindi' | 'hinglish' | null {
  // Strip button/system tags before checking
  const clean = text.replace(/\[.*?\]/g, '').trim();
  if (!clean) return null;

  // Devanagari Unicode block → several chars is unambiguous Hindi script
  const devanagariChars = (clean.match(/[ऀ-ॿ]/g) ?? []).length;
  const latinLetters = (clean.match(/[a-zA-Z]/g) ?? []).length;
  if (devanagariChars >= 3) return 'hindi';

  // English indicator: common English-only words not found in Roman Hindi
  const hasEnglishWords = /\b(the|is|are|was|were|your|you\b|tell|about|first|what|how|when|where|why|please|thank|thanks|hello|hi\b|because|with|for\b|and\b|but\b|business|product|feature|price|demo|information|help|support|company|office|work|i am|i want|i need|can you|do you|are you|this is|that is|okay|ok\b|yes\b|no\b|sure|sorry|good|great|nice|today|tomorrow|time\b|address|location|order|payment|pay\b|cost|charge|free\b|available|service|services|team\b|call\b|message|send\b|reply|confirm|confirmed|cancel|change|update|account|name\b|number|details|detail)\b/i.test(clean);

  if (latinLetters > 3 && hasEnglishWords) return 'english';

  // A couple of stray Devanagari chars only acts as a tie-breaker when there isn't
  // already substantial Latin text competing with it — not an automatic override.
  if (devanagariChars >= 1 && latinLetters <= 3) return 'hindi';

  // Hinglish detection: Latin script with Roman Hindi markers (no English-only words found)
  const hasHindiRoman = /\b(kya|hai|nahi|nahin|nai|haan|han|kaise|kab|kahan|kaun|kyun|kyunki|tha|thi|the|ho|hoga|hogi|honge|karo|karna|karta|karti|raha|rahi|rahe|chahiye|chahie|chaiye|mujhe|tumhe|aapko|usse|inhe|unhe|aap|tum|hum|mein|pe|se|ko|ka|ki|ke|aur|bhi|phir|fir|sab|ek|do|koi|kuch|bahut|thoda|jaldi|abhi|aaj|kal|yahan|wahan|bhai|yaar|bolo|btao|batao|dekho|sunlo|theek|thik|accha|acha|sahi|galat|zyada|kam|lena|dena|dedo|lelo|bhejo|bhej|milega|milegi|hogya|hogyi|krdiya|krdega|krna|krke|krlo|mt|nhi|toh|tou|par\b|matlab|samjha|samjho|pata|malum|bata|batao|kitna|kitni|kuch|koi)\b/i.test(clean);

  if (latinLetters > 3 && hasHindiRoman) return 'hinglish';

  return null; // truly ambiguous — let AI decide
}

const HOT_KEYWORDS  = ['buy', 'purchase', 'price', 'cost', 'how much', 'interested', 'want', 'need', 'demo', 'trial', 'order', 'book', 'plan', 'pricing', 'quote', 'kharidna', 'lena hai', 'chahiye', 'kitna', 'rate'];
const COLD_KEYWORDS = ['later', 'maybe', 'not now', 'baad mein', 'sochenge', 'dekhenge', 'no thanks', 'nahi chahiye', 'wrong number'];

export function detectLeadTemperature(text: string): 'hot' | 'warm' | 'cold' {
  const lower = text.toLowerCase();
  if (HOT_KEYWORDS.some((k)  => lower.includes(k))) return 'hot';
  if (COLD_KEYWORDS.some((k) => lower.includes(k))) return 'cold';
  return 'warm';
}

export async function getAIReply(
  customerMessage: string,
  customerName: string,
  kbContext = '',
  imageUrl?: string,
  wsSettings?: Record<string, unknown>,
  businessName = 'our team',
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  intentLabel?: string | null,
): Promise<string | null> {
  const { getModel } = await import('@/lib/ai-router');
  const model = imageUrl
    ? getModel(wsSettings ?? null, 'vision_model')
    : getModel(wsSettings ?? null, 'auto_reply_model');

  // Per-workspace agent persona overrides the generic prompt when set
  const agentPersona = (wsSettings?.agent_persona as string | undefined)?.trim() ?? '';

  // ── Deterministic button responses (defined in persona, no AI needed) ──────────
  if (!imageUrl) {
    const buttonLabel = extractButtonLabel(customerMessage);
    if (buttonLabel) {
      const buttonMap = parseButtonResponses(agentPersona);
      const exactResponse = buttonMap.get(buttonLabel.toLowerCase());
      if (exactResponse) {
        console.log(`[AI] Deterministic button response for "${buttonLabel}"`);
        return exactResponse;
      }
    }
  }

  // ── Conversation stage — adjusts AI behavior based on how far along we are ───
  const historyLen = conversationHistory.length;
  // Detect if customer is explicitly asking for product/feature information
  const isProductInfoQuery = /\b(tell me about|about your|what (do|can|does)|features?|how (does|do)|what is|explain|overview|benefits?|capabilities|product info|services?)\b/i.test(customerMessage);
  const conversationStage =
    isProductInfoQuery
      ? 'CONVERSATION STAGE: Customer asked for product information. Give a COMPLETE list of ALL features and benefits from the knowledge base. Do NOT skip any feature. Do NOT ask a qualifying question — instead end with an offer to demo or explore a specific feature.'
      : historyLen === 0
      ? 'CONVERSATION STAGE: First message. Respond warmly and ask ONE question to understand what they need.'
      : historyLen <= 3
      ? 'CONVERSATION STAGE: Early. You know a little about them. Ask one qualifying question (e.g. team size, current process, main problem) if not yet asked.'
      : historyLen <= 7
      ? 'CONVERSATION STAGE: Mid. You understand their situation. Provide specific value, address their concern, and offer a clear next step (demo / pricing / trial).'
      : 'CONVERSATION STAGE: Extended. Focus on resolving any remaining objection and confirming the next step. If they seem stuck, offer to connect them with a team member.';

  const kbSection = kbContext
    ? `\n\nKNOWLEDGE BASE — answer from this accurately:\n${kbContext}\n\nIMPORTANT: When the customer asks about features, products, or "about your business", list EVERY feature mentioned in the knowledge base above — do not pick only 2-3. Only state facts that appear verbatim or as a clear paraphrase in the knowledge base above. Do not combine or blend facts from different, unrelated sections to construct an answer — if the specific question isn't directly covered, say a team member will follow up instead of guessing. Never guess or invent.`
    : '\nIf you do not know the answer, say a team member will follow up — do NOT guess or invent information.';

  // ── Intent framing — same classifier that feeds conversations.labels on the
  // dashboard, reused here so billing/complaint/sales messages get different framing
  // instead of one generic prompt for every kind of message ────────────────────
  const intentGuidance = intentLabel === 'billing'
    ? 'INTENT: This message is about billing or payments. Stay focused on resolving that — do not pitch new products or features here.'
    : intentLabel === 'complaint'
    ? 'INTENT: This message is a complaint. Lead with empathy, acknowledge the issue directly, and do NOT upsell or pitch anything in this reply.'
    : intentLabel === 'support'
    ? 'INTENT: This is a support question. Prioritize a clear, correct answer over moving the sale forward.'
    : intentLabel === 'spam'
    ? ''
    : '';

  // ── Lead temperature — already computed elsewhere for the CRM, reused here so a
  // "maybe later" reply doesn't still get a pushy sales push ────────────────────
  const temperature = detectLeadTemperature(customerMessage);
  const temperatureGuidance = temperature === 'cold'
    ? 'LEAD SIGNAL: Customer signaled low urgency or hesitation. Respect their timeline — acknowledge warmly, do NOT push for a demo or next step right now.'
    : temperature === 'hot'
    ? 'LEAD SIGNAL: Customer signaled strong interest. Guide them clearly toward a concrete next step (pricing, demo, or order).'
    : '';

  const basePersona = agentPersona
    ? agentPersona
    : `You are a helpful WhatsApp customer support assistant for ${businessName}.`;

  const nowIST = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const systemPrompt = `${basePersona}

[SYSTEM: Current date and time (IST) = ${nowIST}]

RULES (follow strictly):
- Customer name: ${customerName}. Greet by name at most once — after that, continue naturally without repeating the greeting.
- Reply length: Match the question. Simple conversational replies (yes/no, quick answers) → 1-2 sentences. Product/feature questions ("tell me about your product", "what can you do", "what features") → give a complete, structured answer with all relevant points. Never cut short a product explanation just to be brief.
- WhatsApp formatting: Use *single asterisk* for bold headings/feature names. Use plain hyphens (-) for bullet lists. NEVER use ** double asterisk, ##, or other markdown — WhatsApp ignores those.
- End replies with ONE clear question or call-to-action — do not list multiple options.
- BUTTON HANDLING: When message starts with "[Tapped button:" or "[Selected:", respond ONLY to that button's intent. Never say "you tapped" or "you clicked". Use persona-defined responses if available (BUTTON definitions above). Otherwise:
  • "Know more" / "Learn more" → explain the core value/benefit of your product. Do NOT jump to demo.
  • "Not Interested" / "No thanks" → acknowledge warmly, close gracefully. Do NOT pitch or continue selling.
  • "Book Demo" / "Schedule Demo" → confirm interest, ask for preferred day/time.
  • "Contact Us" / "Talk to Agent" → say a team member will reach out soon.
  • Any other button → respond directly to what that label means.
- Never invent product names, prices, or features not in the knowledge base.
${conversationStage}
${intentGuidance}
${temperatureGuidance}
${kbSection}

CRITICAL LANGUAGE RULE — HIGHEST PRIORITY, OVERRIDES EVERYTHING ABOVE:
Identify the language of the customer's CURRENT message (the last message they sent, not previous history).
- If the customer wrote in ENGLISH → your reply MUST be in English only. No Hindi words.
- If the customer wrote in HINDI (Devanagari or Roman Hindi) → your reply MUST be in Hindi only. No English sentences.
- If the customer wrote in HINGLISH (mixed) → reply in the same Hinglish mix they used.
- The persona language, previous messages, and conversation history do NOT determine your reply language. Only the customer's current message does.
- When in doubt: match the script the customer used (English letters → English reply, Hindi/Roman-Hindi → Hindi reply).`;

  // Vision path: multimodal content (image URL array) requires direct OpenRouter fetch
  if (imageUrl) {
    const apiKey = process.env.OPENROUTER_API_KEY?.replace(/\uFEFF/g, '').trim();
    if (!apiKey) {
      console.warn('[AI] OPENROUTER_API_KEY not set — using fallback reply');
      return null;
    }
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://whatsapp-automation-kohl-six.vercel.app',
          'X-Title': 'Agentix',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageUrl } },
                { type: 'text', text: customerMessage || 'What is in this image? Respond helpfully.' },
              ],
            },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[AI] OpenRouter vision error ${res.status}:`, errBody);
        return null;
      }
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data?.choices?.[0]?.message?.content?.trim() ?? null;
      if (!reply) console.warn('[AI] Empty response from OpenRouter (vision)');
      return reply;
    } catch (error) {
      console.error('[AI] Vision fetch error:', error);
      return null;
    }
  }

  // Text path: use the central AI client with conversation history for context
  try {
    // Programmatically detect language and append an instruction the AI cannot ignore
    const detectedLang = detectReplyLanguage(customerMessage);
    const langInstruction = detectedLang === 'english'
      ? '\n\n[SYSTEM OVERRIDE: Customer wrote in English. You MUST reply in English only. No Hindi words.]'
      : detectedLang === 'hindi'
      ? '\n\n[SYSTEM OVERRIDE: Customer wrote in Hindi. You MUST reply in Hindi only. No English sentences.]'
      : detectedLang === 'hinglish'
      ? '\n\n[SYSTEM OVERRIDE: Customer wrote in Hinglish (Roman-script Hindi mixed with English). You MUST reply in Hinglish — write Hindi words in Roman script (not Devanagari), mix in English words naturally, exactly as the customer wrote. Do NOT reply in pure English.]'
      : '';
    const userContent = customerMessage + langInstruction;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userContent },
    ];
    const reply = await callAI(messages, { model, maxTokens: 350, temperature: 0.4 });
    if (!reply) console.warn('[AI] Empty response from AI client');
    return reply;
  } catch (error) {
    console.error('[AI] Network/parse error:', error);
    return null;
  }
}

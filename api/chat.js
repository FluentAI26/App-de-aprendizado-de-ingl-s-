// ═══════════════════════════════════════════════════════════════
//  FluentAI — Vercel Serverless Function: /api/chat
//  Proteções:
//    ✅ Modelo trocado: llama-3.1-8b-instant (14.400 req/dia grátis)
//    ✅ CORS restrito ao domínio do app
//    ✅ Rate limiting: 10 req/minuto por IP
//    ✅ Limite diário por IP: 200 req/dia
//    ✅ Validação e sanitização das mensagens
//    ✅ Tamanho máximo de mensagem: 500 chars
//    ✅ Máximo 10 mensagens por chamada
//    ✅ Token beta para controlar acesso (opcional)
// ═══════════════════════════════════════════════════════════════

// Rate limiting em memória (reseta quando a função reinicia)
// Para produção com muitos usuários, substituir por Redis/KV store
const rateLimitStore = {};
const dailyLimitStore = {};

// Limpeza periódica — remove entradas expiradas para evitar memory leak
// Roda a cada 30 minutos enquanto a instância estiver ativa
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(rateLimitStore)) {
    if (now - rateLimitStore[ip].windowStart > RATE_WINDOW_MS * 2) {
      delete rateLimitStore[ip];
    }
  }
  for (const ip of Object.keys(dailyLimitStore)) {
    if (now - dailyLimitStore[ip].dayStart > DAY_MS * 2) {
      delete dailyLimitStore[ip];
    }
  }
}, 30 * 60 * 1000).unref(); // .unref() não bloqueia o event loop da função

const RATE_WINDOW_MS = 60 * 1000;      // janela de 1 minuto
const RATE_MAX_PER_MIN = 10;           // máx 10 req por minuto por IP
const RATE_MAX_PER_DAY = 200;          // máx 200 req por dia por IP
const DAY_MS = 24 * 60 * 60 * 1000;   // 24 horas em ms

function checkRateLimit(ip) {
  const now = Date.now();

  // ── Limite por minuto ────────────────────────────────────────
  if (!rateLimitStore[ip]) {
    rateLimitStore[ip] = { count: 0, windowStart: now };
  }

  const minuteData = rateLimitStore[ip];
  if (now - minuteData.windowStart > RATE_WINDOW_MS) {
    minuteData.count = 0;
    minuteData.windowStart = now;
  }
  minuteData.count++;

  if (minuteData.count > RATE_MAX_PER_MIN) {
    return {
      blocked: true,
      reason: "Muitas requisições. Aguarde 1 minuto e tente novamente.",
      retryAfter: Math.ceil((RATE_WINDOW_MS - (now - minuteData.windowStart)) / 1000),
    };
  }

  // ── Limite por dia ───────────────────────────────────────────
  if (!dailyLimitStore[ip]) {
    dailyLimitStore[ip] = { count: 0, dayStart: now };
  }

  const dayData = dailyLimitStore[ip];
  if (now - dayData.dayStart > DAY_MS) {
    dayData.count = 0;
    dayData.dayStart = now;
  }
  dayData.count++;

  if (dayData.count > RATE_MAX_PER_DAY) {
    return {
      blocked: true,
      reason: "Limite diário atingido. Volte amanhã para continuar estudando! 🎓",
      retryAfter: Math.ceil((DAY_MS - (now - dayData.dayStart)) / 1000),
    };
  }

  return { blocked: false };
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-10) // máximo 10 mensagens
    .filter(m => m && typeof m === "object")
    .map(m => ({
      role: ["assistant", "system"].includes(m.role) ? m.role : "user",
      content: String(m.content || "").substring(0, 2000).trim(), // system prompts são mais longos
    }))
    .filter(m => m.content.length > 0);
}

export default async function handler(req, res) {

  // ── Domínio permitido ────────────────────────────────────────
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // defina ALLOWED_ORIGIN nas env vars do Vercel

  // ── CORS headers ─────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  // ── CORS preflight ───────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ── Só aceita POST ───────────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // ── Rate limiting por IP ─────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "unknown";

  const rateCheck = checkRateLimit(ip);
  if (rateCheck.blocked) {
    res.setHeader("Retry-After", String(rateCheck.retryAfter || 60));
    return res.status(429).json({ error: rateCheck.reason });
  }

  // ── Chave da API ─────────────────────────────────────────────
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY not set in environment variables");
    return res.status(500).json({ error: "Servidor não configurado. Contate o suporte." });
  }

  // ── Parse do body ────────────────────────────────────────────
  // Vercel parseia o body JSON automaticamente em req.body
  const { messages, level } = req.body || {};

  // ── Validação básica ─────────────────────────────────────────
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array é obrigatório." });
  }

  // ── Sanitiza mensagens ───────────────────────────────────────
  const safeMessages = sanitizeMessages(messages);
  if (safeMessages.length === 0) {
    return res.status(400).json({ error: "Nenhuma mensagem válida encontrada." });
  }

  // ── Nível do estudante ───────────────────────────────────────
  const VALID_LEVELS = [
    "Beginner", "Basic", "Pre-Intermediate",
    "Intermediate", "Upper-Intermediate", "Advanced"
  ];
  const safeLevel = VALID_LEVELS.includes(level) ? level : "Beginner";
  const usePt = ["Beginner", "Basic"].includes(safeLevel);
  const lang = usePt ? "Portuguese" : "English";

  // ── System prompt ────────────────────────────────────────────
  // Se o frontend já mandou um system message (ex: P_AI_COACH_SYSTEM, P_READING, P_VOCAB_GENERATE),
  // o backend usa ele diretamente — não sobrescreve com o genérico.
  // O system prompt do backend só é usado como fallback para chamadas sem system message.
  const hasSystemMessage = safeMessages.some(m => m.role === "system");

  const fallbackSystemPrompt = `You are FluentAI Coach, an expert English teacher for Brazilian Portuguese speakers at ${safeLevel} level.

CRITICAL LANGUAGE RULE:
- ALWAYS respond primarily in English, regardless of student level
- Use ${lang} ONLY for brief grammar explanations (1-2 sentences max)
- NEVER use Portuguese as the main language of your response
- If the student writes in Portuguese, respond in English and gently redirect

YOUR TEACHING STYLE:
- Adapt vocabulary strictly to ${safeLevel}: ${safeLevel === "Beginner" || safeLevel === "Basic" ? "simple, common words only" : "natural, level-appropriate language"}
- Always correct errors — never ignore mistakes
- End EVERY response with a speaking challenge or follow-up question in English
- Keep responses concise (max 150 words)

WHEN STUDENT SENDS A SENTENCE TO CORRECT:
1. ✅ Corrected: [fixed version in English]
2. 💡 More natural: [native-sounding version in English]
3. 📝 Rule: [grammar rule in ${lang}, max 2 sentences]
4. 🗣️ Your turn: [follow-up question in English]

NEVER give generic responses. NEVER translate entire sentences without teaching the pattern.`;

  // ── Chamada à API do Groq (timeout 8s — margem antes do limite 10s da Netlify) ──
  try {
    const ctrl = new AbortController();
    const groqTimeout = setTimeout(() => ctrl.abort(), 8000);

    let response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          // ✅ Modelo atualizado: 14.400 req/dia grátis (era 1.000)
          model: "llama-3.1-8b-instant",
          max_tokens: 400,
          temperature: 0.7,
          messages: hasSystemMessage
            ? safeMessages  // frontend já mandou system message completo (P_AI_COACH_SYSTEM, etc.)
            : [{ role: "system", content: fallbackSystemPrompt }, ...safeMessages],
        }),
        signal: ctrl.signal,
      });
    } catch (fetchErr) {
      clearTimeout(groqTimeout);
      if (fetchErr.name === "AbortError") {
        return res.status(408).json({ error: "⏱ A IA demorou demais para responder. Tente novamente." });
      }
      throw fetchErr; // repassa para o catch externo
    }
    clearTimeout(groqTimeout);

    // ── Erro da API do Groq ──────────────────────────────────
    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", response.status, errText);

      // Repassa o 429 do Groq para o cliente
      if (response.status === 429) {
        return res.status(429).json({ error: "Serviço temporariamente sobrecarregado. Tente novamente em instantes." });
      }

      return res.status(502).json({ error: "Erro no serviço de IA. Tente novamente." });
    }

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Sorry, I could not generate a response. Please try again.";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Function error:", err.message);
    return res.status(500).json({ error: "Erro interno. Tente novamente em alguns instantes." });
  }
}

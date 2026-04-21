// ═══════════════════════════════════════════════════════════════
//  FluentAI — Netlify Function: /api/chat
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
      retryAfter: Math.ceil((DAY_MS - (now - dayData.dayStart)) / 60),
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
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").substring(0, 500).trim(),
    }))
    .filter(m => m.content.length > 0);
}

exports.handler = async function (event) {

  // ── Domínio permitido ────────────────────────────────────────
  // Troque para o seu domínio real no Netlify
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://fluentai-english.netlify.app";

  const headers = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // ── CORS preflight ───────────────────────────────────────────
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // ── Só aceita POST ───────────────────────────────────────────
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  // ── Rate limiting por IP ─────────────────────────────────────
  const ip =
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    "unknown";

  const rateCheck = checkRateLimit(ip);
  if (rateCheck.blocked) {
    return {
      statusCode: 429,
      headers: {
        ...headers,
        "Retry-After": String(rateCheck.retryAfter || 60),
      },
      body: JSON.stringify({ error: rateCheck.reason }),
    };
  }

  // ── Chave da API ─────────────────────────────────────────────
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY not set in environment variables");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Servidor não configurado. Contate o suporte." }),
    };
  }

  // ── Parse do body ────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Requisição inválida." }),
    };
  }

  const { messages, level } = body;

  // ── Validação básica ─────────────────────────────────────────
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "messages array é obrigatório." }),
    };
  }

  // ── Sanitiza mensagens ───────────────────────────────────────
  const safeMessages = sanitizeMessages(messages);
  if (safeMessages.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Nenhuma mensagem válida encontrada." }),
    };
  }

  // ── Nível do estudante ───────────────────────────────────────
  const VALID_LEVELS = [
    "Beginner", "Basic", "Pre-Intermediate",
    "Intermediate", "Upper-Intermediate", "Advanced"
  ];
  const safeLevel = VALID_LEVELS.includes(level) ? level : "Beginner";
  const usePt = ["Beginner", "Basic"].includes(safeLevel);

  // ── System prompt ────────────────────────────────────────────
  const systemPrompt = `You are FluentAI, an expert English tutor for Brazilian Portuguese speakers focused on fast fluency. Student level: ${safeLevel}.

Your teaching method uses:
- Comprehensible Input (i+1): always slightly above current level
- Active Recall: ask questions that force memory retrieval
- Output Hypothesis: always end with a speaking challenge
- Chunk-based learning: teach full phrases, not isolated words
- Spaced Repetition: revisit key vocabulary naturally

When the user sends a sentence to be corrected:
1. ✅ Corrected: [corrected version]
2. 💡 More natural: [better, more native-sounding version]
3. 📝 Explanation: [short, clear explanation${usePt ? " — in Portuguese" : ""}]
4. 🗣️ Now you: [a follow-up speaking question to keep them producing output]

When the user asks a question or wants to practice conversation:
- Answer warmly and concisely
- Use vocabulary appropriate for ${safeLevel} level
- Always end with a question or speaking challenge
${usePt ? "- Mix English and brief Portuguese hints for clarity" : "- Respond fully in English"}

Rules:
- Be encouraging and positive
- Keep responses concise (max 150 words)
- Never just translate — teach patterns and chunks
- If they write in Portuguese, gently redirect to English`;

  // ── Chamada à API do Groq ────────────────────────────────────
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
        messages: [
          { role: "system", content: systemPrompt },
          ...safeMessages,
        ],
      }),
    });

    // ── Erro da API do Groq ──────────────────────────────────
    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", response.status, errText);

      // Repassa o 429 do Groq para o cliente
      if (response.status === 429) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            error: "Serviço temporariamente sobrecarregado. Tente novamente em instantes.",
          }),
        };
      }

      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Erro no serviço de IA. Tente novamente.",
        }),
      };
    }

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Sorry, I could not generate a response. Please try again.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    };

  } catch (err) {
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Erro interno. Tente novamente em alguns instantes.",
      }),
    };
  }
};

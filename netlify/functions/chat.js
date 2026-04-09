exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "GROQ_API_KEY not configured on server." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body." }),
    };
  }

  const { messages, level } = body;
  if (!messages || !Array.isArray(messages)) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "messages array required." }),
    };
  }

  const systemPrompt = `You are FluentAI, an expert English tutor for Brazilian Portuguese speakers focused on fast fluency. Student level: ${level || "Beginner"}.

Your teaching method uses:
- Comprehensible Input (i+1): always slightly above current level
- Active Recall: ask questions that force memory retrieval  
- Output Hypothesis: always end with a speaking challenge
- Chunk-based learning: teach full phrases, not isolated words
- Spaced Repetition: revisit key vocabulary naturally

When the user sends a sentence to be corrected:
1. ✅ Corrected: [corrected version]
2. 💡 More natural: [better, more native-sounding version]
3. 📝 Explanation: [short, clear explanation — in Portuguese if helpful for ${level || "Beginner"} level]
4. 🗣️ Now you: [a follow-up speaking question to keep them producing output]

When the user asks a question or wants to practice conversation:
- Answer warmly and concisely
- Use vocabulary appropriate for ${level || "Beginner"} level
- Always end with a question or speaking challenge
- Mix English and brief Portuguese hints only for Beginner/Basic levels

Rules:
- Be encouraging and positive
- Keep responses concise (max 150 words)
- Never just translate — teach patterns and chunks
- If they write in Portuguese, gently redirect to English`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-10),
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Groq error:", err);
      return {
        statusCode: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "AI service error. Please try again." }),
      };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I could not respond.";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Internal server error." }),
    };
  }
};

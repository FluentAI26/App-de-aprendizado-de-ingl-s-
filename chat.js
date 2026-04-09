# FluentAI — Fase 1

App web de aprendizado de inglês com IA adaptativa, voz nativa e base pedagógica científica.

---

## Estrutura do projeto

```
fluentai/
├── public/
│   └── index.html          ← App completo (frontend)
├── netlify/
│   └── functions/
│       └── chat.js         ← Proxy seguro para a API do Groq
├── netlify.toml            ← Configuração do Netlify
└── README.md
```

---

## Deploy passo a passo

### 1. Obter a chave da API do Groq (gratuito)

1. Acesse https://console.groq.com
2. Crie uma conta com e-mail ou Google (sem cartão)
3. Vá em **API Keys** → **Create API Key**
4. Copie a chave (começa com `gsk_...`)

---

### 2. Fazer upload para o GitHub

1. Acesse https://github.com e crie uma conta
2. Clique em **New repository** → nome: `fluentai` → Public → Create
3. Faça upload de todos os arquivos desta pasta:
   - Clique em **uploading an existing file**
   - Arraste toda a pasta `fluentai` ou os arquivos individualmente
   - Mantenha a estrutura de pastas
4. Clique em **Commit changes**

> Alternativa sem GitHub: pule para o passo 3b (Netlify Drop)

---

### 3a. Deploy no Netlify via GitHub (recomendado)

1. Acesse https://netlify.com e crie uma conta
2. Clique em **Add new site** → **Import an existing project**
3. Conecte ao GitHub e selecione o repositório `fluentai`
4. Configurações de build:
   - **Base directory**: deixe em branco
   - **Build command**: deixe em branco
   - **Publish directory**: `public`
5. Clique em **Deploy site**

---

### 3b. Deploy no Netlify via arrastar (mais rápido)

1. Acesse https://app.netlify.com/drop
2. Arraste a **pasta `public`** para a área indicada
3. O site ficará online em segundos

> ⚠️ Com este método, a Netlify Function (AI Coach) **não** funcionará.
> Para o AI Coach funcionar, use o método 3a com GitHub.

---

### 4. Configurar a chave do Groq (OBRIGATÓRIO para o AI Coach)

1. No painel do Netlify, vá em **Site configuration** → **Environment variables**
2. Clique em **Add a variable**
3. Preencha:
   - **Key**: `GROQ_API_KEY`
   - **Value**: sua chave do Groq (ex: `gsk_abc123...`)
4. Clique em **Save**
5. Vá em **Deploys** → **Trigger deploy** → **Deploy site**

---

### 5. Pronto!

Seu site estará em um link como:
```
https://nome-aleatorio.netlify.app
```

Para personalizar o domínio: **Domain settings** → **Add custom domain**

---

## Funcionalidades

| Feature | Status |
|---|---|
| Dashboard com progresso | ✅ |
| Listening Trainer | ✅ |
| Speaking com reconhecimento de voz | ✅ (Chrome/Edge) |
| Reading com perguntas | ✅ |
| Vocabulary / Flashcards | ✅ |
| Spaced Repetition Review | ✅ |
| AI Coach (Groq Llama 3.3 70B) | ✅ |
| Texto em voz alta (TTS) | ✅ |
| 4 níveis adaptativos | ✅ |
| Dark mode | ✅ |
| Mobile responsive | ✅ |

---

## Limites do plano gratuito

| Serviço | Limite gratuito |
|---|---|
| Netlify hosting | Ilimitado |
| Netlify Functions | 125.000 req/mês |
| Groq API | 14.400 req/dia |
| Reconhecimento de voz | Ilimitado (nativo do browser) |
| TTS (texto para fala) | Ilimitado (nativo do browser) |

Para um grupo de até 50 pessoas usando diariamente, esses limites são mais que suficientes.

---

## Compatibilidade de voz

| Browser | Reconhecimento (microfone) | TTS (fala) |
|---|---|---|
| Chrome | ✅ | ✅ |
| Edge | ✅ | ✅ |
| Firefox | ❌ | ✅ |
| Safari | ⚠️ parcial | ✅ |

Recomende Chrome ou Edge para melhor experiência.

---

## Próximos passos (Fase 2)

- Login com e-mail / Google (Supabase)
- Progresso salvo no banco de dados
- Reconhecimento de pronúncia (Groq Whisper)
- Plano freemium com Stripe
- PWA (installable como app)

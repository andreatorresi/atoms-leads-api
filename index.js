import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

// ---- Config ----
const PORT = Number(process.env.PORT) || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("API listening on port", PORT);
});
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN; // es. https://tuodominio.it (NO slash finale)

// Basic hard-check
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

// Supabase client (SERVER-SIDE ONLY)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Middleware
app.use(express.json({ limit: "200kb" }));

app.use(
  cors({
    origin: (origin, cb) => {
      // Permette chiamate server-to-server o tool test senza Origin
      if (!origin) return cb(null, true);

      // Permette solo l'origine attesa (Atoms live)
      if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) return cb(null, true);

      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);

// Healthcheck (utile per debug)
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// Helper: email validation (minima, robusta)
function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Endpoint: riceve lead
app.post("/api/lead", async (req, res) => {
  try {
    const {
      nome,
      email,
      telefono,
      messaggio,
      consenso_privacy,
      utm_source,
      utm_medium,
      utm_campaign,
      fonte,
      // honeypot anti-spam (campo invisibile nel form)
      company
    } = req.body || {};

    // Anti-spam (honeypot): se compilato, droppa in modo “silenzioso”
    if (company && String(company).trim() !== "") {
      return res.status(200).json({ success: true });
    }

    // Validazioni minime
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "Email non valida" });
    }
    if (consenso_privacy !== true) {
      return res.status(400).json({ success: false, error: "Consenso privacy richiesto" });
    }

    const payload = {
      nome: (nome || "").toString().trim().slice(0, 200),
      email: email.trim().toLowerCase(),
      telefono: (telefono || "").toString().trim().slice(0, 50) || null,
      messaggio: (messaggio || "").toString().trim().slice(0, 5000) || null,
      consenso_privacy: true,
      fonte: (fonte || "atoms").toString().trim().slice(0, 50),
      utm_source: (utm_source || "").toString().trim().slice(0, 150) || null,
      utm_medium: (utm_medium || "").toString().trim().slice(0, 150) || null,
      utm_campaign: (utm_campaign || "").toString().trim().slice(0, 150) || null
    };

    // Insert su Supabase
    const { error } = await supabase.from("leads").insert(payload);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ success: false, error: "Errore salvataggio lead" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ success: false, error: "Errore server" });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});


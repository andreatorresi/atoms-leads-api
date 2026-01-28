import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// --- FIX DNS & CONFIG ---
// Pulizia dell'URL per evitare errori ENOTFOUND causati da spazi o slash finali
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Errore: Variabili SUPABASE_URL o KEY mancanti.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const ALLOWED_ROLES = ["Titolare", "Direttore", "Farmacista", "Altro"];
const ALLOWED_REVENUES = [
  "Meno di €500.000",
  "€500.000 - €1.000.000",
  "€1.000.000 - €2.000.000",
  "Oltre €2.000.000"
];

app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || !ALLOWED_ORIGIN || origin === ALLOWED_ORIGIN) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`), false);
  },
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

// --- UTILS ---
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.trim().toLowerCase());

// --- ROUTES ---

// 1. Diagnostic Route (Per risolvere il tuo errore ENOTFOUND)
app.get("/api/debug-supabase", async (req, res) => {
  try {
    const { data, error } = await supabase.from("leads").select("id").limit(1);
    if (error) throw error;
    res.status(200).json({ status: "Connected", url: SUPABASE_URL, sample: data });
  } catch (err) {
    res.status(500).json({ status: "Connection Failed", error: err.message, code: err.code });
  }
});

app.get("/health", (req, res) => res.status(200).json({ ok: true }));

// 2. Lead Ingestion
app.post("/api/lead", async (req, res) => {
  try {
    const body = req.body || {};
    
    // Validazione rapida
    if (!isValidEmail(body.email)) return res.status(400).json({ error: "Email non valida" });
    if (!body.privacy) return res.status(400).json({ error: "Privacy obbligatoria" });

    // ---- MAPPING DINAMICO (Atoms -> Supabase Schema) ----
    const row = {
      // Mapping basato sul tuo CSV (snake_case)
      first_name: body.firstName?.trim(),
      last_name: body.lastName?.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim(),
      pharmacy_name: body.pharmacyName?.trim(),
      role: ALLOWED_ROLES.includes(body.role) ? body.role : "Altro",
      annual_revenue: body.revenue,
      main_challenge: body.challenge?.trim(),
      privacy_accepted: true,
      
      // Retrocompatibilità / Campi Extra
      nome: `${body.firstName} ${body.lastName}`,
      messaggio: body.challenge,
      fonte: "atoms"
    };

    const { error } = await supabase
      .from("leads")
      .upsert(row, { onConflict: "email" });

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("Runtime Error:", e);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Target URL: ${SUPABASE_URL}`);
});

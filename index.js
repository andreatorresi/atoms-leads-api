import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// --- CONFIGURAZIONE ---
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();

// Lista domini autorizzati
const ALLOWED_ORIGINS = [
  "https://q7cfks.pub.atoms.dev",
  "https://www.pharmametrics.it",
  "https://pharmametrics.it"
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.error("❌ ERRORE: Variabili d'ambiente mancanti.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(RESEND_API_KEY);

// --- MIDDLEWARE CORS OTTIMIZZATO ---
app.use(cors({
  origin: (origin, cb) => {
    // Permetti se: 1. Nessun origin (test locali) 2. È in lista 3. È un sottodominio temporaneo di Atoms
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith("atoms.dev")) {
      return cb(null, true);
    }
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "300kb" }));

// --- ROTTE ---

app.get("/health", (req, res) => res.status(200).json({ status: "online" }));

app.post("/api/lead", async (req, res) => {
  const body = req.body || {};
  try {
    const row = {
      first_name: body.firstName?.trim(),
      last_name: body.lastName?.trim(),
      email: body.email?.trim().toLowerCase(),
      phone: body.phone?.trim(),
      pharmacy_name: body.pharmacyName?.trim(),
      role: body.role,
      annual_revenue: body.revenue,
      main_challenge: body.challenge?.trim(),
      privacy_accepted: true,
      fonte: "atoms",
      nome: `${body.firstName} ${body.lastName}`,
      messaggio: body.challenge
    };

    const { error: dbError } = await supabase.from("leads").upsert(row, { onConflict: "email" });
    if (dbError) throw dbError;

    // Notifica Email ad Andrea
    try {
      await resend.emails.send({
        from: 'Notifiche Lead <onboarding@resend.dev>',
        to: 'andrea.torresi@torresistudio.it',
        subject: `🚀 Nuovo Lead: ${body.pharmacyName || 'Farmacia'}`,
        html: `<h2>Nuovo Lead Ricevuto</h2>
               <p><strong>Nome:</strong> ${body.firstName} ${body.lastName}</p>
               <p><strong>Email:</strong> ${body.email}</p>
               <p><strong>Farmacia:</strong> ${body.pharmacyName}</p>
               <p><strong>Fatturato:</strong> ${body.revenue}</p>`
      });
    } catch (mErr) { console.error("Errore Resend:", mErr.message); }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Errore Generale:", error.message);
    return res.status(500).json({ success: false, error: "Errore interno" });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`🚀 API Online su porta ${PORT}`));

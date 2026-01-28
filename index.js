import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();

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

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith("atoms.dev")) {
      return cb(null, true);
    }
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "300kb" }));

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

    // --- INVIO EMAIL CON TABELLA COMPLETA ---
    try {
      await resend.emails.send({
        from: 'Notifiche Lead <onboarding@resend.dev>',
        to: 'andrea.torresi@torresistudio.it',
        subject: `🚀 Nuovo Lead: ${body.pharmacyName || 'Farmacia'}`,
        html: `
          <div style="font-family: sans-serif; color: #333;">
            <h2>Nuovo Lead Ricevuto!</h2>
            <p>Un nuovo utente ha compilato il form sulla landing page.</p>
            <table style="width: 100%; max-width: 600px; border-collapse: collapse; margin-bottom: 20px;">
              <tr><td style="padding: 10px; border: 1px solid #eee; background: #f9f9f9; font-weight: bold; width: 30%;">Nome:</td><td style="padding: 10px; border: 1px solid #eee;">${body.firstName} ${body.lastName}</td></tr>
              <tr><td style="padding: 10px; border: 1px solid #eee; background: #f9f9f9; font-weight: bold;">Email:</td><td style="padding: 10px; border: 1px solid #eee;">${body.email}</td></tr>
              <tr><td style="padding: 10px; border: 1px solid #eee; background: #f9f9f9; font-weight: bold;">Telefono:</td><td style="padding: 10px; border: 1px solid #eee;">${body.phone || 'Non fornito'}</td></tr>
              <tr><td style="padding: 10px; border: 1px solid #eee; background: #f9f9f9; font-weight: bold;">Farmacia:</td><td style="padding: 10px; border: 1px solid #eee;">${body.pharmacyName}</td></tr>
              <tr><td style="padding: 10px; border: 1px solid #eee; background: #f9f9f9; font-weight: bold;">Ruolo:</td><td style="padding: 10px; border: 1px solid #eee;">${body.role || 'Non fornito'}</td></tr>
              <tr><td style="padding: 10px; border: 1px solid #eee; background: #f9f9f9; font-weight: bold;">Fatturato:</td><td style="padding: 10px; border: 1px solid #eee;">${body.revenue}</td></tr>
              <tr><td style="padding: 10px; border: 1px solid #eee; background: #f9f9f9; font-weight: bold;">Sfida:</td><td style="padding: 10px; border: 1px solid #eee;">${body.challenge || 'Nessuna specifica'}</td></tr>
            </table>
            <p style="font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 10px;">Lead salvato correttamente su Supabase.</p>
          </div>
        `
      });
      console.log("✅ Notifica dettagliata inviata.");
    } catch (mErr) { 
      console.error("⚠️ Errore Resend:", mErr.message); 
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Errore Generale:", error.message);
    return res.status(500).json({ success: false, error: "Errore interno" });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`🚀 API attiva sulla porta ${PORT}`));

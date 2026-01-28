import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const app = express();

// -------------------- CONFIGURAZIONE --------------------
const PORT = Number(process.env.PORT) || 8080;

// Pulizia URL e Key per prevenire errori DNS
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN?.trim() || "*";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.error("❌ ERRORE: Variabili d'ambiente mancanti (Supabase o Resend).");
  process.exit(1);
}

// Inizializzazione Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(RESEND_API_KEY);

// -------------------- MIDDLEWARE --------------------
app.use(express.json({ limit: "300kb" }));
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

// -------------------- ROTTE --------------------

app.get("/health", (req, res) => res.status(200).json({ status: "online" }));

// Endpoint Ricezione Lead (Atoms)
app.post("/api/lead", async (req, res) => {
  const body = req.body || {};

  try {
    // --- MAPPING DATI PER SUPABASE ---
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

    // --- 1. SALVATAGGIO SU DATABASE ---
    const { error: dbError } = await supabase
      .from("leads")
      .upsert(row, { onConflict: "email" });

    if (dbError) {
      console.error("❌ Errore DB Supabase:", dbError.message);
      throw dbError;
    }

    // --- 2. INVIO NOTIFICA EMAIL (RESEND) ---
    try {
      await resend.emails.send({
        from: 'Notifiche Lead <onboarding@resend.dev>',
        to: 'andrea.torresi@torresistudio.it',
        subject: `🚀 Nuovo Lead: ${body.pharmacyName || 'Farmacia'}`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
            <h2>Nuovo Lead Ricevuto!</h2>
            <p>Un nuovo utente ha compilato il form sulla landing page.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; border: 1px solid #eee;"><strong>Nome:</strong></td><td style="padding: 8px; border: 1px solid #eee;">${body.firstName} ${body.lastName}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border: 1px solid #eee;">${body.email}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee;"><strong>Telefono:</strong></td><td style="padding: 8px; border: 1px solid #eee;">${body.phone}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee;"><strong>Farmacia:</strong></td><td style="padding: 8px; border: 1px solid #eee;">${body.pharmacyName}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee;"><strong>Ruolo:</strong></td><td style="padding: 8px; border: 1px solid #eee;">${body.role}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee;"><strong>Fatturato:</strong></td><td style="padding: 8px; border: 1px solid #eee;">${body.revenue}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #eee;"><strong>Sfida:</strong></td><td style="padding: 8px; border: 1px solid #eee;">${body.challenge}</td></tr>
            </table>
            <p style="margin-top: 20px; font-size: 12px; color: #888;">Lead salvato correttamente su Supabase.</p>
          </div>
        `
      });
      console.log("✅ Notifica inviata ad Andrea.");
    } catch (mailErr) {
      console.error("⚠️ Errore Resend:", mailErr.message);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ Errore Generale:", error.message);
    return res.status(500).json({ success: false, error: "Errore interno" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API per Andrea Torresi attiva sulla porta ${PORT}`);
});

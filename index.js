import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

// -------------------- CONFIG --------------------
const PORT = Number(process.env.PORT) || 8080;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN; // es. https://q7cfks.pub.atoms.dev

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
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

// -------------------- MIDDLEWARE --------------------
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: (origin, cb) => {
      // Permetti chiamate senza Origin (curl, server-to-server)
      if (!origin) return cb(null, true);

      // Se non è impostato ALLOWED_ORIGIN, non bloccare (debug).
      // In produzione, impostalo sempre.
      if (!ALLOWED_ORIGIN) return cb(null, true);

      if (origin === ALLOWED_ORIGIN) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ["POST", "OPTIONS", "GET"],
    allowedHeaders: ["Content-Type"]
  })
);

// -------------------- UTILS --------------------
function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function assertStringField(name, v, min, max) {
  if (typeof v !== "string") return `${name} deve essere una stringa`;
  const s = v.trim();
  if (s.length < min) return `${name} deve essere almeno ${min} caratteri`;
  if (s.length > max) return `${name} deve essere massimo ${max} caratteri`;
  return null;
}

function toBoolean(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") {
    const x = v.trim().toLowerCase();
    return x === "true" || x === "1" || x === "on" || x === "yes";
  }
  if (typeof v === "number") return v === 1;
  return false;
}

// -------------------- ROUTES --------------------
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/**
 * Payload JSON inviato da Atoms:
 * {
 *  "firstName": "Mario",
 *  "lastName": "Rossi",
 *  "email": "mario.rossi@farmacia.it",
 *  "phone": "0733881000",
 *  "pharmacyName": "Farmacia Comunale",
 *  "role": "Titolare",
 *  "revenue": "€500.000 - €1.000.000",
 *  "challenge": "Difficoltà nella gestione delle scorte e margini bassi",
 *  "privacy": true
 * }
 */
app.post("/api/lead", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      pharmacyName,
      role,
      revenue,
      challenge,
      privacy
    } = req.body || {};

    // ---- VALIDAZIONI (Atoms) ----
    const err =
      assertStringField("firstName", firstName, 2, 100) ||
      assertStringField("lastName", lastName, 2, 100) ||
      (isValidEmail(email) ? null : "Email non valida") ||
      assertStringField("phone", phone, 6, 20) ||
      assertStringField("pharmacyName", pharmacyName, 3, 255) ||
      assertStringField("challenge", challenge, 10, 2000);

    if (err) return res.status(400).json({ success: false, error: err });

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: "Ruolo non valido" });
    }

    if (!ALLOWED_REVENUES.includes(revenue)) {
      return res.status(400).json({ success: false, error: "Fatturato non valido" });
    }

    if (toBoolean(privacy) !== true) {
      return res.status(400).json({ success: false, error: "Privacy deve essere accettata" });
    }

    // ---- DB MAPPING (Supabase) ----
    // Usiamo colonne Atoms-native già presenti in public.leads:
    // first_name, last_name, email, phone, pharmacy_name, role, revenue, challenge, privacy, fonte
    const row = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      pharmacy_name: pharmacyName.trim(),
      role,
      revenue,
      challenge: challenge.trim(),
      privacy: true,
      fonte: "atoms"
    };

    // Upsert su email (vincolo UNIQUE su leads.email già presente)
    const { error } = await supabase.from("leads").upsert(row, { onConflict: "email" });

    if (error) {
      console.error("Supabase upsert error:", error);
      return res.status(500).json({ success: false, error: "Errore salvataggio lead" });
    }

    return res.status(200).json({ success: true, message: "Lead ricevuto" });
  } catch (e) {
    console.error("Unhandled error:", e);
    return res.status(500).json({ success: false, error: "Errore server" });
  }
});

// -------------------- START --------------------
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("API listening on port", PORT);
});

server.on("error", (err) => {
  console.error("Server listen error:", err);
  process.exit(1);
});

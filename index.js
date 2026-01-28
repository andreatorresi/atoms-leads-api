import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

// ---- Config / Env ----
const PORT = Number(process.env.PORT) || 8080;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN; // es. https://atoms.dev oppure https://tuodominio.it

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// ---- Middleware ----
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: (origin, cb) => {
      // Permetti richieste senza Origin (curl, server-to-server)
      if (!origin) return cb(null, true);

      // Se ALLOWED_ORIGIN non è impostato, non bloccare (debug).
      // In produzione: imposta ALLOWED_ORIGIN e fai bloccare il resto.
      if (!ALLOWED_ORIGIN) return cb(null, true);

      if (origin === ALLOWED_ORIGIN) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);

// ---- Utils ----
function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function cleanStr(v, maxLen) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
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

// ---- Routes ----
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

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

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "Email non valida" });
    }

    if (toBoolean(privacy) !== true) {
      return res.status(400).json({ success: false, error: "Privacy richiesta" });
    }

    const payload = {
      first_name: cleanStr(firstName, 150),
      last_name: cleanStr(lastName, 150),
      email: email.trim().toLowerCase(),
      phone: cleanStr(phone, 50),
      pharmacy_name: cleanStr(pharmacyName, 200),
      role: cleanStr(role, 100),
      revenue: cleanStr(revenue, 100),
      challenge: cleanStr(challenge, 5000),
      privacy: true,
      fonte: "atoms"
    };

    const { error } = await supabase.from("leads").insert(payload);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ success: false, error: "Errore salvataggio lead" });
    }

    return res.status(200).json({ success: true, message: "Lead ricevuto" });
  } catch (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ success: false, error: "Errore server" });
  }
});

// ---- Start (UNO SOLO) ----
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("API listening on port", PORT);
});

server.on("error", (err) => {
  console.error("Server listen error:", err);
  process.exit(1);
});

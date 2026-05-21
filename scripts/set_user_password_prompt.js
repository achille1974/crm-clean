const fs = require("fs");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(path) {
  const env = {};
  const text = fs.readFileSync(path, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;

    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();

    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }

    env[t.slice(0, i).trim()] = v;
  }

  return env;
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

async function main() {
  const env = loadEnv(".env.local");

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const email = (await ask("Email utente: ")).toLowerCase();
  const password = await ask("Nuova password, visibile solo nel terminale: ");

  if (!email) {
    throw new Error("Email mancante.");
  }

  if (!password || password.length < 8) {
    throw new Error("La password deve avere almeno 8 caratteri.");
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) throw error;

  const user = data.users.find(
    (item) => String(item.email || "").toLowerCase() === email
  );

  if (!user) {
    throw new Error(`Utente non trovato in Supabase Auth: ${email}`);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    {
      password,
      email_confirm: true,
    }
  );

  if (updateError) throw updateError;

  console.log("");
  console.log(`OK: password aggiornata per ${email}`);
}

main().catch((error) => {
  console.error("");
  console.error("ERRORE:", error.message || error);
  process.exit(1);
});

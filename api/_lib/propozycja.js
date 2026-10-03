// Walidacja i obsługa propozycji nowych miejsc.
// Wspólne dla funkcji Vercel (api/propozycje.js) i lokalnego serwera (scripts/dev-server.mjs).
// Pliki w api/ zaczynające się od "_" Vercel nie wystawia jako osobnych endpointów.

export const TYPES = ["kawiarnia", "coworking", "biblioteka", "darmowe"];
export const OUTLETS = ["dużo", "średnio", "mało"];
export const NOISE = ["cicho", "umiarkowanie", "gwarno"];
export const LAPTOP = ["tak", "ograniczenia"];
export const MAX_BODY_BYTES = 10_000;

const oneLine = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

// Pole-pułapka na boty: ludzie go nie widzą, więc nie wypełniają.
export const isSpam = (input) => typeof input?.website === "string" && input.website.trim() !== "";

export function validate(input) {
  const errors = {};
  const name = oneLine(input?.name);
  const address = oneLine(input?.address);
  const district = oneLine(input?.district);
  const note = typeof input?.note === "string" ? input.note.trim() : "";

  if (name.length < 2) errors.name = "Podaj nazwę miejsca.";
  else if (name.length > 120) errors.name = "Nazwa może mieć maksymalnie 120 znaków.";

  if (address.length < 3) errors.address = "Podaj adres, np. „Wilcza 42”.";
  else if (address.length > 160) errors.address = "Adres może mieć maksymalnie 160 znaków.";

  if (district.length > 60) errors.district = "Nazwa dzielnicy jest za długa.";
  if (!TYPES.includes(input?.type)) errors.type = "Wybierz rodzaj miejsca.";
  if (note.length > 1000) errors.note = "Opis może mieć maksymalnie 1000 znaków.";

  // Pola opcjonalne: puste = "nie wiem".
  const pick = (key, allowed) => {
    const v = input?.[key];
    if (v === undefined || v === null || v === "") return null;
    if (!allowed.includes(v)) { errors[key] = "Nieprawidłowa wartość."; return null; }
    return v;
  };
  const outlets = pick("outlets", OUTLETS);
  const noise = pick("noise", NOISE);
  const laptop = pick("laptop", LAPTOP);

  let wifi = null;
  if (input?.wifi !== undefined && input?.wifi !== null && input?.wifi !== "") {
    wifi = Number(input.wifi);
    if (!Number.isInteger(wifi) || wifi < 1 || wifi > 5) { errors.wifi = "Oceń Wi-Fi w skali 1–5."; wifi = null; }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: { name, address, district: district || null, type: input?.type, wifi, outlets, noise, laptop, note: note || null },
  };
}

const json = (body, status) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Zwraca handler POST (Web API Request -> Response). `save(data)` zapisuje poprawne zgłoszenie.
export function createHandler(save) {
  return async function POST(request) {
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
      return json({ error: "Zgłoszenie jest za duże." }, 413);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Nieprawidłowe dane formularza." }, 400);
    }
    // Botom udajemy sukces, żeby nie próbowały dalej.
    if (isSpam(body)) return json({ ok: true }, 201);

    const { ok, errors, data } = validate(body);
    if (!ok) return json({ error: "Popraw zaznaczone pola.", errors }, 422);

    try {
      await save(data);
    } catch (err) {
      console.error("Nie udało się zapisać propozycji:", err);
      return json({ error: "Nie udało się zapisać propozycji. Spróbuj ponownie za chwilę." }, 500);
    }
    return json({ ok: true }, 201);
  };
}

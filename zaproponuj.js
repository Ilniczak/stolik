(() => {
  "use strict";

  const PLACES = window.PLACES || [];
  const ENDPOINT = "/api/propozycje";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const form = $("#suggestForm");
  const alertBox = $("#formAlert");
  const submitBtn = $("#submitBtn");
  const success = $("#success");

  const TYPE = {
    kawiarnia: { one: "Kawiarnia", color: "--t-kawiarnia" },
    coworking: { one: "Coworking", color: "--t-coworking" },
    biblioteka: { one: "Biblioteka", color: "--t-biblioteka" },
    darmowe: { one: "Miejskie / za darmo", color: "--t-darmowe" },
  };
  const LABELS = {
    outlets: { "dużo": "dużo", "średnio": "kilka", "mało": "prawie wcale" },
    noise: { cicho: "cicho", umiarkowanie: "umiarkowanie", gwarno: "gwarno" },
    laptop: { tak: "mile widziane", ograniczenia: "z ograniczeniami" },
  };
  // 18 dzielnic Warszawy + Powiśle, którego używamy na mapie.
  const DISTRICTS = ["Bemowo", "Białołęka", "Bielany", "Mokotów", "Ochota", "Powiśle", "Praga-Południe", "Praga-Północ",
    "Rembertów", "Śródmieście", "Targówek", "Ursus", "Ursynów", "Wawer", "Wesoła", "Wilanów", "Włochy", "Wola", "Żoliborz"];

  /* ───────── Theme (wspólny z resztą strony) ───────── */

  try {
    const saved = localStorage.getItem("stolik-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch {}
  $("#themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("stolik-theme", next); } catch {}
  });

  /* ───────── Setup ───────── */

  $("#f-district").innerHTML = `<option value="">Nie wiem / inna</option>` +
    DISTRICTS.map((d) => `<option value="${d}">${d}</option>`).join("");

  const val = (name) => {
    const el = form.elements[name];
    return (el instanceof RadioNodeList ? el.value : el?.value ?? "").trim();
  };
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]+/g, " ").trim();

  /* ───────── Live preview ───────── */

  function setText(id, text, empty) {
    const el = $(id);
    const changed = el.textContent !== text;
    el.textContent = text;
    el.classList.toggle("is-empty", empty);
    if (changed && !empty && el.tagName === "B") {
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }
  }

  let lastType = "kawiarnia";
  function updatePreview() {
    const name = val("name"), address = val("address"), district = val("district"), type = val("type") || "kawiarnia";
    setText("#pvName", name || "Nazwa miejsca", !name);
    const where = [address, district].filter(Boolean).join(", ") || "Warszawa";
    $("#pvMeta").textContent = `${TYPE[type].one} · ${where}`;

    const pin = $("#pvPin");
    pin.style.setProperty("--c", `var(${TYPE[type].color})`);
    if (type !== lastType) { pin.classList.remove("bump"); void pin.offsetWidth; pin.classList.add("bump"); lastType = type; }

    const wifi = val("wifi");
    setText("#pvWifi", wifi ? `${wifi}/5` : "brak danych", !wifi);
    for (const key of ["outlets", "noise", "laptop"]) {
      const v = val(key);
      setText(`#pv${key[0].toUpperCase()}${key.slice(1)}`, v ? LABELS[key][v] : "brak danych", !v);
    }
    const note = val("note");
    setText("#pvNote", note || "Tu pojawi się Twój opis.", !note);
    $("#noteCount").textContent = form.elements.note.value.length;
  }

  /* ───────── Duplicate hint ───────── */

  const known = PLACES.map((p) => ({ p, key: norm(p.name) }));
  function checkDuplicate() {
    const q = norm(val("name"));
    const hint = $("#dupHint");
    const hit = q.length >= 4 && known.find(({ key }) => key.includes(q) || (q.includes(key) && key.length >= 4));
    if (!hit) { hint.hidden = true; return; }
    hint.hidden = false;
    hint.innerHTML = "";
    hint.append("Wygląda na to, że ");
    const a = document.createElement("a");
    a.href = `mapa.html?miejsce=${encodeURIComponent(hit.p.id)}`;
    a.textContent = hit.p.name;
    hint.append(a, " już jest na mapie. Jeśli to inne miejsce, śmiało wysyłaj.");
  }

  /* ───────── Validation ───────── */

  function showErrors(errors) {
    $$(".field.has-error", form).forEach((f) => f.classList.remove("has-error"));
    $$("[data-err]", form).forEach((p) => { p.textContent = ""; });
    let first = null;
    for (const [key, msg] of Object.entries(errors)) {
      const p = $(`[data-err="${key}"]`, form);
      if (!p) continue;
      p.textContent = msg;
      const field = p.closest(".field");
      field.classList.add("has-error");
      first ??= field.querySelector("input, select, textarea");
    }
    first?.focus();
  }

  function clientValidate() {
    const errors = {};
    if (val("name").length < 2) errors.name = "Podaj nazwę miejsca.";
    if (val("address").length < 3) errors.address = "Podaj adres, np. „Wilcza 42”.";
    if (!TYPE[val("type")]) errors.type = "Wybierz rodzaj miejsca.";
    return errors;
  }

  form.addEventListener("input", (e) => {
    const field = e.target.closest(".field");
    if (field?.classList.contains("has-error")) {
      field.classList.remove("has-error");
      const p = $("[data-err]", field);
      if (p) p.textContent = "";
    }
    if (e.target.name === "name") checkDuplicate();
    updatePreview();
  });

  /* ───────── Submit ───────── */

  function setLoading(on) {
    submitBtn.classList.toggle("is-loading", on);
    submitBtn.disabled = on;
    $(".btn-label", submitBtn).textContent = on ? "Wysyłam…" : "Wyślij propozycję";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.hidden = true;
    const errors = clientValidate();
    if (Object.keys(errors).length) { showErrors(errors); return; }

    const payload = {
      name: val("name"), address: val("address"), district: val("district"), type: val("type"),
      wifi: val("wifi") ? Number(val("wifi")) : null,
      outlets: val("outlets"), noise: val("noise"), laptop: val("laptop"),
      note: val("note"), website: form.elements.website.value,
    };

    setLoading(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        $("#successText").textContent = `Sprawdzimy „${payload.name}” i dodamy na mapę, jeśli dobrze się tam pracuje.`;
        form.closest(".suggest-grid").hidden = true;
        success.hidden = false;
        success.focus();
        scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (res.status === 422 && data.errors) showErrors(data.errors);
      alertBox.textContent = data.error || "Nie udało się wysłać propozycji. Spróbuj ponownie.";
      alertBox.hidden = false;
    } catch {
      alertBox.textContent = "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";
      alertBox.hidden = false;
    } finally {
      setLoading(false);
    }
  });

  $("#againBtn").addEventListener("click", () => {
    form.reset();
    $("#dupHint").hidden = true;
    success.hidden = true;
    form.closest(".suggest-grid").hidden = false;
    updatePreview();
    form.elements.name.focus();
  });

  updatePreview();
})();

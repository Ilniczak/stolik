(() => {
  "use strict";

  const PLACES = window.PLACES || [];
  const byId = new Map(PLACES.map((p) => [p.id, p]));

  const TYPES = {
    wszystkie: { label: "Wszystkie" },
    kawiarnia: { label: "Kawiarnie", one: "Kawiarnia", color: "--t-kawiarnia" },
    coworking: { label: "Coworkingi", one: "Coworking", color: "--t-coworking" },
    biblioteka: { label: "Biblioteki", one: "Biblioteka", color: "--t-biblioteka" },
    darmowe: { label: "Za darmo", one: "Miejskie / bezpłatne", color: "--t-darmowe" },
  };

  const TOGGLES = [
    { id: "open", label: "Otwarte teraz", test: (p) => isOpenNow(p) === true },
    { id: "outlets", label: "Dużo gniazdek", test: (p) => p.outlets === "dużo" },
    { id: "quiet", label: "Cicho", test: (p) => p.noise === "cicho" },
    { id: "laptop", label: "Laptop zawsze OK", test: (p) => p.laptop === "tak" },
  ];

  const DAY_NAMES = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

  const state = {
    type: "wszystkie",
    q: "",
    district: "",
    sort: "score",
    toggles: new Set(),
    selected: null,
    hover: null,
    me: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    chips: $("typeChips"), toggles: $("toggles"), q: $("q"), district: $("district"), sort: $("sort"),
    list: $("list"), listHead: $("listHead"), listView: $("listView"), detail: $("detail"),
    empty: $("empty"), reset: $("resetBtn"), lede: $("lede"), legend: $("legend"), theme: $("themeToggle"),
  };

  /* ───────── Helpers ───────── */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
  }

  const { weekOf, warsawNow, isOpenNow, closesAt, fmtMin } = window.StolikHours;

  function distKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(1).replace(".", ",")} km`);

  const gmaps = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.address}, Warszawa`)}`;
  const amaps = (p) => `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`;

  /* ───────── Filtering ───────── */

  function filtered() {
    const q = norm(state.q.trim());
    let out = PLACES.filter((p) => {
      if (state.type !== "wszystkie" && p.type !== state.type) return false;
      if (state.district && p.district !== state.district) return false;
      if (q && !norm(`${p.name} ${p.address} ${p.district}`).includes(q)) return false;
      for (const t of TOGGLES) if (state.toggles.has(t.id) && !t.test(p)) return false;
      return true;
    });
    const typeRank = (p) => Object.keys(TYPES).indexOf(p.type);
    const byScore = (a, b) => b.score - a.score || typeRank(a) - typeRank(b) || (b.wifi ?? 0) - (a.wifi ?? 0) || a.name.localeCompare(b.name, "pl");
    if (state.sort === "near" && state.me) out.sort((a, b) => distKm(state.me, a) - distKm(state.me, b));
    else if (state.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name, "pl"));
    else out.sort(byScore);
    return out;
  }

  /* ───────── Map ───────── */

  try {
    const saved = localStorage.getItem("stolik-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch {}

  // MapLibre GL + OpenFreeMap: darmowe kafelki wektorowe z OSM, bez klucza API.
  const isDark = () => document.documentElement.dataset.theme === "dark"
    || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const styleUrl = () => `https://tiles.openfreemap.org/styles/${isDark() ? "dark" : "positron"}`;

  const map = new maplibregl.Map({
    container: "map",
    style: styleUrl(),
    center: [21.0122, 52.2297],
    zoom: 12.4,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>',
  }), "bottom-right");

  function setTiles() {
    map.setStyle(styleUrl(), { diff: false });
    map.getContainer().classList.toggle("is-dark", isDark());
  }
  map.getContainer().classList.toggle("is-dark", isDark());

  // Polskie nazwy na mapie (styl domyślnie pokazuje np. "Warsaw").
  map.on("style.load", () => {
    for (const layer of map.getStyle().layers) {
      if (layer.type === "symbol" && map.getLayoutProperty(layer.id, "text-field")) {
        map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:pl"], ["get", "name"]]);
      }
    }
  });

  const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 34, className: "pin-tip" });
  const showTip = (p) => tip.setLngLat([p.lng, p.lat]).setText(p.name).addTo(map);

  const markers = new Map();
  for (const p of PLACES) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "pin-wrap";
    el.setAttribute("aria-label", `${p.name}, ocena ${p.score} na 5`);
    el.innerHTML = `<div class="pin" style="--c: var(${TYPES[p.type].color})"><b>${p.score}</b></div>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); select(p.id, { fly: false }); });
    el.addEventListener("mouseenter", () => { setHover(p.id); if (state.selected !== p.id) showTip(p); });
    el.addEventListener("mouseleave", () => { setHover(null); tip.remove(); });
    const m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]);
    markers.set(p.id, { m, el, shown: false });
  }

  let meMarker = null;
  // Start: centrum miasta. Dopasowanie do pinezek dopiero po zmianie filtrów.
  let lastFitKey = PLACES.map((p) => p.id).sort().join(",");

  function renderMarkers(list) {
    const visible = new Set(list.map((p) => p.id));
    if (state.selected) visible.add(state.selected);
    for (const [id, mk] of markers) {
      const want = visible.has(id);
      if (want && !mk.shown) mk.m.addTo(map);
      if (!want && mk.shown) mk.m.remove();
      mk.shown = want;
    }
    syncPinClasses();
    const key = list.map((p) => p.id).sort().join(",");
    if (key !== lastFitKey && list.length && !state.selected) {
      lastFitKey = key;
      const b = new maplibregl.LngLatBounds();
      list.forEach((p) => b.extend([p.lng, p.lat]));
      if (state.me && state.sort === "near") b.extend([state.me.lng, state.me.lat]);
      map.fitBounds(b, { padding: 56, maxZoom: 14.5, duration: 600 });
    }
  }

  function syncPinClasses() {
    for (const [id, { el }] of markers) {
      const pin = el.firstElementChild;
      pin.classList.toggle("is-active", id === state.selected);
      pin.classList.toggle("is-hover", id === state.hover && id !== state.selected);
      pin.classList.toggle("is-dim", !!state.selected && id !== state.selected);
      el.style.zIndex = id === state.selected ? 3 : id === state.hover ? 2 : "";
    }
  }

  function setHover(id, fromList = false) {
    state.hover = id;
    syncPinClasses();
    els.list.querySelectorAll(".item").forEach((li) => li.classList.toggle("is-hover", li.dataset.id === id));
    if (!fromList) return;
    const p = id && byId.get(id);
    if (p && markers.get(id).shown && !state.selected) showTip(p);
    else tip.remove();
  }

  /* ───────── Render: chips, toggles, selects ───────── */

  function renderChips() {
    const counts = { wszystkie: PLACES.length };
    for (const p of PLACES) counts[p.type] = (counts[p.type] || 0) + 1;
    els.chips.innerHTML = Object.entries(TYPES).map(([k, t]) => `
      <button class="chip" role="tab" type="button" data-type="${k}" aria-selected="${state.type === k}">
        ${t.color ? `<span class="dot" style="background: var(${t.color})"></span>` : ""}
        ${t.label} <span class="count">${counts[k] || 0}</span>
      </button>`).join("");
    els.legend.innerHTML = Object.entries(TYPES).filter(([, t]) => t.color)
      .map(([, t]) => `<span><i style="background: var(${t.color})"></i>${t.label}</span>`).join("");
  }

  function renderToggles() {
    els.toggles.innerHTML = TOGGLES.map((t) =>
      `<button class="toggle" type="button" data-toggle="${t.id}" aria-pressed="${state.toggles.has(t.id)}">${t.label}</button>`).join("");
  }

  function renderDistricts() {
    const ds = [...new Set(PLACES.map((p) => p.district))].sort((a, b) => a.localeCompare(b, "pl"));
    els.district.innerHTML = `<option value="">Wszystkie dzielnice</option>` +
      ds.map((d) => `<option value="${esc(d)}" ${d === state.district ? "selected" : ""}>${esc(d)}</option>`).join("");
  }

  /* ───────── Render: list ───────── */

  function itemHTML(p) {
    const open = isOpenNow(p);
    const openTxt = open === true ? `<span class="open-now">Otwarte</span>` : open === false ? `<span class="closed-now">Zamknięte</span>` : "";
    const dist = state.me ? `<span>${fmtDist(distKm(state.me, p))}</span>` : "";
    const meta = [esc(p.district), openTxt, dist].filter(Boolean).join(`<span class="sep">·</span>`);
    const badges = [
      p.cost === "bezpłatnie" ? `<span class="badge badge-free">free</span>` : "",
      p.verify ? `<span class="badge badge-warn">sprawdź</span>` : "",
    ].join("");
    return `
      <li class="item" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}, ocena ${p.score} na 5">
        <div class="item-name"><span>${esc(p.name)}</span>${badges}</div>
        <div class="item-meta"><span class="type-dot" style="background: var(${TYPES[p.type].color})"></span>${meta}</div>
        <div class="item-score">${p.score}/5</div>
      </li>`;
  }

  function render() {
    const list = filtered();
    const n = list.length;
    els.lede.textContent = `${n} ${plural(n, "miejsce", "miejsca", "miejsc")}, w ${plural(n, "którym", "których", "których")} warto otworzyć laptopa.`;
    const sortTxt = state.sort === "near" && state.me ? "najbliższe pierwsze" : state.sort === "name" ? "alfabetycznie" : "najlepsze do pracy pierwsze";
    els.listHead.textContent = n ? `${n} ${plural(n, "miejsce", "miejsca", "miejsc")}, ${sortTxt}` : "";
    els.list.innerHTML = list.map(itemHTML).join("");
    els.empty.hidden = n > 0;
    els.chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-selected", c.dataset.type === state.type));
    els.toggles.querySelectorAll(".toggle").forEach((b) => b.setAttribute("aria-pressed", state.toggles.has(b.dataset.toggle)));
    renderMarkers(list);
  }

  /* ───────── Render: detail ───────── */

  const ICONS = {
    wifi: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16.1a5 5 0 0 1 7 0M12 20h.01"/></svg>',
    plug: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v4"/></svg>',
    ear: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10M2 20h20l-2-4H4l-2 4Z"/></svg>',
  };

  const wifiText = (w) => w == null ? ["Wi-Fi: brak danych", "Większość lokali ma Wi-Fi. Hasło zwykle dostaniesz przy kasie."]
    : w >= 5 ? ["Wi-Fi, na którym da się pracować", "Szybkie i stabilne, nadaje się na calle."]
    : w >= 4 ? ["Solidne Wi-Fi", "Na maile i dokumenty w zupełności wystarczy."]
    : ["Wi-Fi bywa kapryśne", "W razie czego miej pod ręką hotspot z telefonu."];
  const outletText = (o) => ({
    "dużo": ["Gniazdka wszędzie", "Gdzieś się na pewno podłączysz."],
    "średnio": ["Kilka gniazdek", "Najlepiej zajmij miejsce przy ścianie."],
    "mało": ["Mało gniazdek", "Przyjdź z naładowaną baterią."],
  }[o] || ["Gniazdka: brak danych", "Na wszelki wypadek naładuj laptopa przed wyjściem."]);
  const noiseText = (n) => ({
    "cicho": ["Cicho", "Da się skupić i spokojnie pracować."],
    "umiarkowanie": ["Umiarkowany gwar", "Słuchawki się przydadzą, ale nie są konieczne."],
    "gwarno": ["Gwarno", "Lepiej do maili niż do głębokiej pracy."],
  }[n] || ["Hałas: brak danych", ""]);
  const laptopText = (p) => p.laptop === "tak"
    ? ["Siedź, ile chcesz", "Laptopy są tu mile widziane."]
    : ["Laptop z ograniczeniami", "Są strefy albo godziny bez laptopów."];

  function hoursHTML(p) {
    const week = weekOf(p);
    if (!week) {
      return `<p class="note">Brak godzin w naszych danych. <a href="${gmaps(p)}" target="_blank" rel="noopener">Sprawdź w Mapach Google →</a></p>`;
    }
    const { day } = warsawNow();
    return `<ul class="hours">${week.map((r, i) => `
      <li class="${i === day ? "today" : ""}">
        <span>${DAY_NAMES[i]}</span>
        <span>${r.length ? r.map(([s, e]) => `${fmtMin(s)}–${fmtMin(e)}`).join(", ") : "zamknięte"}</span>
      </li>`).join("")}</ul>`;
  }

  function renderDetail(p) {
    const open = isOpenNow(p);
    const close = open ? closesAt(p) : null;
    const openTxt = open === true ? `Otwarte${close ? ` do ${close}` : ""}` : open === false ? "Teraz zamknięte" : "Godziny: brak danych";
    const kind = p.kind || TYPES[p.type].one;
    const feats = [
      [ICONS.wifi, ...wifiText(p.wifi)],
      [ICONS.plug, ...outletText(p.outlets)],
      [ICONS.ear, ...noiseText(p.noise)],
      [ICONS.laptop, ...laptopText(p)],
    ];
    const wifiBars = p.wifi ? `<span class="wifi-bars" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= p.wifi ? "on" : ""}"></i>`).join("")}</span>` : "";

    const near = PLACES.filter((x) => x.id !== p.id)
      .map((x) => ({ x, d: distKm(p, x) }))
      .sort((a, b) => a.d - b.d).slice(0, 4);

    els.detail.innerHTML = `
      <div class="detail-top">
        <button class="back" type="button" data-action="back">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/></svg>
          Wszystkie miejsca
        </button>
        <button class="share" type="button" data-action="share">Udostępnij</button>
      </div>

      <h2>${esc(p.name)}</h2>
      <p class="sub">${esc(kind)} · ${esc(p.district)} · ${esc(p.address)}</p>

      <div class="score-card">
        <div class="score-big">${p.score}/5<small>do pracy</small></div>
        <dl class="score-facts">
          <div><dt>Dzielnica</dt><dd>${esc(p.district)}</dd></div>
          <div><dt>Teraz</dt><dd class="${open ? "open-now" : ""}">${openTxt}</dd></div>
          <div><dt>Koszt</dt><dd>${esc(p.cost)}</dd></div>
        </dl>
        <div class="map-links">
          <a class="btn btn-primary" href="${gmaps(p)}" target="_blank" rel="noopener">Otwórz w Mapach Google</a>
          <a class="btn" href="${amaps(p)}" target="_blank" rel="noopener">Apple Maps</a>
          ${p.url ? `<a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">Strona</a>` : ""}
        </div>
      </div>

      ${p.verify ? `<p class="note note-warn">Dane mogą być nieaktualne. Zanim pojedziesz, sprawdź godziny i to, czy lokal nadal działa.</p>` : ""}

      <ul class="feats">
        ${feats.map(([ico, b, s]) => `<li class="feat"><div class="feat-ico" aria-hidden="true">${ico}</div><div><b>${b}</b>${s ? `<span>${s}</span>` : ""}</div></li>`).join("")}
      </ul>

      <h3>Dlaczego warto</h3>
      <p class="why">${esc(p.why)}</p>
      ${p.tip ? `<p class="note">💡 ${esc(p.tip)}</p>` : ""}
      ${p.warn ? `<p class="note note-warn">⚠️ ${esc(p.warn)}</p>` : ""}

      <h3 style="margin-top:22px">W skrócie</h3>
      <dl class="facts">
        <div><dt>Wi-Fi</dt><dd>${p.wifi ? `${p.wifi}/5${wifiBars}` : "brak danych"}</dd></div>
        <div><dt>Gniazdka</dt><dd>${p.outlets || "brak danych"}</dd></div>
        <div><dt>Hałas</dt><dd>${p.noise || "brak danych"}</dd></div>
        <div><dt>Laptopy</dt><dd>${p.laptop === "tak" ? "mile widziane" : "z ograniczeniami"}</dd></div>
        <div><dt>Typ</dt><dd>${esc(kind)}</dd></div>
        <div><dt>Koszt</dt><dd>${esc(p.cost)}</dd></div>
      </dl>

      <h3>Godziny otwarcia</h3>
      ${hoursHTML(p)}

      <h3>W pobliżu</h3>
      <ol class="nearby">${near.map(({ x, d }) => `
        <li class="item" data-id="${x.id}" tabindex="0" role="button">
          <div class="item-name"><span>${esc(x.name)}</span></div>
          <div class="item-meta"><span class="type-dot" style="background: var(${TYPES[x.type].color})"></span>${esc(x.district)}<span class="sep">·</span>${fmtDist(d)}</div>
          <div class="item-score">${x.score}/5</div>
        </li>`).join("")}</ol>
    `;
  }

  /* ───────── Selection & URL ───────── */

  const mobile = () => matchMedia("(max-width: 900px)").matches;

  function select(id, { fly = true, push = true, instant = false } = {}) {
    const p = byId.get(id);
    if (!p) return;
    state.selected = id;
    renderDetail(p);
    els.listView.hidden = true;
    els.detail.hidden = false;
    syncPinClasses();
    tip.remove();
    const mk = markers.get(id);
    if (!mk.shown) { mk.m.addTo(map); mk.shown = true; }
    const zoom = Math.max(map.getZoom(), 14.5);
    if (instant) map.jumpTo({ center: [p.lng, p.lat], zoom });
    else if (fly) map.flyTo({ center: [p.lng, p.lat], zoom, duration: 500 });
    else map.easeTo({ center: [p.lng, p.lat], duration: 400 });
    if (push) updateURL();
    document.title = `${p.name} · stolik`;
    if (mobile()) els.detail.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: Math.min(window.scrollY, document.getElementById("mapa").offsetTop - 80), behavior: "smooth" });
  }

  function deselect({ push = true } = {}) {
    state.selected = null;
    els.detail.hidden = true;
    els.listView.hidden = false;
    document.title = "stolik · Warszawa na mapie";
    syncPinClasses();
    if (push) updateURL();
    render();
  }

  function updateURL() {
    const u = new URL(location.href);
    u.search = "";
    if (state.selected) u.searchParams.set("miejsce", state.selected);
    if (state.type !== "wszystkie") u.searchParams.set("typ", state.type);
    if (state.district) u.searchParams.set("dzielnica", state.district);
    history.replaceState(null, "", u);
  }

  function readURL() {
    const sp = new URLSearchParams(location.search);
    const t = sp.get("typ");
    if (t && TYPES[t]) state.type = t;
    const d = sp.get("dzielnica");
    if (d) state.district = d;
    return sp.get("miejsce");
  }

  /* ───────── Geolocation ───────── */

  function locate() {
    if (!navigator.geolocation) { els.sort.value = "score"; state.sort = "score"; return; }
    els.listHead.textContent = "Szukam Twojej lokalizacji…";
    navigator.geolocation.getCurrentPosition((pos) => {
      state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (meMarker) meMarker.remove();
      const dot = document.createElement("div");
      dot.className = "me-dot";
      meMarker = new maplibregl.Marker({ element: dot }).setLngLat([state.me.lng, state.me.lat]).addTo(map);
      lastFitKey = "";
      render();
    }, () => {
      state.sort = "score"; els.sort.value = "score";
      render();
      els.listHead.textContent = "Nie udało się pobrać lokalizacji. Sortuję według oceny.";
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  }

  /* ───────── Theme ───────── */

  function initTheme() {
    els.theme.addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme
        || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("stolik-theme", next); } catch {}
      setTiles();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (!document.documentElement.dataset.theme) setTiles();
    });
  }

  /* ───────── Events ───────── */

  els.chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.type = b.dataset.type;
    if (state.selected) deselect({ push: false });
    updateURL();
    render();
  });

  els.toggles.addEventListener("click", (e) => {
    const b = e.target.closest(".toggle");
    if (!b) return;
    const id = b.dataset.toggle;
    state.toggles.has(id) ? state.toggles.delete(id) : state.toggles.add(id);
    if (state.selected) deselect({ push: false });
    render();
  });

  let qTimer;
  els.q.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.q = els.q.value;
      if (state.selected) deselect({ push: false });
      render();
    }, 120);
  });

  els.district.addEventListener("change", () => {
    state.district = els.district.value;
    if (state.selected) deselect({ push: false });
    updateURL();
    render();
  });

  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    if (state.sort === "near" && !state.me) locate();
    else render();
  });

  els.reset.addEventListener("click", () => {
    state.type = "wszystkie"; state.q = ""; state.district = ""; state.toggles.clear();
    els.q.value = ""; els.district.value = "";
    updateURL();
    render();
  });

  function onItemActivate(e) {
    const li = e.target.closest(".item");
    if (!li) return;
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    select(li.dataset.id);
  }
  for (const root of [els.list, els.detail]) {
    root.addEventListener("click", onItemActivate);
    root.addEventListener("keydown", onItemActivate);
  }
  els.list.addEventListener("mouseover", (e) => {
    const li = e.target.closest(".item");
    if (li && li.dataset.id !== state.hover) setHover(li.dataset.id, true);
  });
  els.list.addEventListener("mouseleave", () => setHover(null, true));

  els.detail.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    if (a.dataset.action === "back") deselect();
    if (a.dataset.action === "share") {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: document.title, url });
        else { await navigator.clipboard.writeText(url); a.textContent = "Skopiowano link"; setTimeout(() => (a.textContent = "Udostępnij"), 1600); }
      } catch {}
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.selected) deselect();
  });

  // Refresh "open now" every minute.
  setInterval(() => { if (!state.selected) render(); }, 60000);

  /* ───────── Boot ───────── */

  initTheme();
  const initial = readURL();
  renderChips();
  renderToggles();
  renderDistricts();
  render();
  if (initial && byId.has(initial)) select(initial, { push: false, instant: true });
})();

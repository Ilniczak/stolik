(() => {
  "use strict";

  const PLACES = window.PLACES || [];
  const { isOpenNow, closesAt } = window.StolikHours;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const TYPE = {
    kawiarnia: { one: "Kawiarnia", color: "--t-kawiarnia" },
    coworking: { one: "Coworking", color: "--t-coworking" },
    biblioteka: { one: "Biblioteka", color: "--t-biblioteka" },
    darmowe: { one: "Za darmo", color: "--t-darmowe" },
  };
  const TYPE_ORDER = Object.keys(TYPE);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const placeUrl = (p) => `mapa.html?miejsce=${encodeURIComponent(p.id)}`;
  const best = [...PLACES].sort((a, b) =>
    b.score - a.score || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || (b.wifi ?? 0) - (a.wifi ?? 0));

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
  }

  /* ───────── Theme (wspólny z mapą) ───────── */

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

  /* ───────── Nav + progress ───────── */

  const nav = $("#nav"), bar = $("#progress");
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      nav.classList.toggle("is-scrolled", y > 8);
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      ticking = false;
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ───────── Hero copy ───────── */

  const n = PLACES.length;
  $("#heroCount").textContent = `Warszawa · ${n} ${plural(n, "sprawdzone miejsce", "sprawdzone miejsca", "sprawdzonych miejsc")}`;

  // Tytuł słowo po słowie, z akcentem na „naprawdę”.
  const title = $("#heroTitle");
  title.innerHTML = title.textContent.trim().split(/ +/).map((w, i) => {
    const cls = w.startsWith("naprawdę") ? ' class="accent"' : "";
    return `<span class="w"><span style="--i:${i}"${cls}>${esc(w)}</span></span>`;
  }).join(" ");

  /* ───────── Hero mini-map ───────── */

  // Uproszczona Warszawa: prawdziwe współrzędne miejsc rzutowane na prostokąt.
  const B = { w: 20.962, e: 21.082, n: 52.272, s: 52.183 };
  const VW = 400, VH = 408;
  const px = (lng, lat) => [((lng - B.w) / (B.e - B.w)) * VW, ((B.n - lat) / (B.n - B.s)) * VH];
  const pathOf = (pts) => pts.map(([lat, lng], i) => {
    const [x, y] = px(lng, lat);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  const VISTULA = [[52.300, 20.955], [52.285, 20.975], [52.272, 20.992], [52.262, 21.006], [52.252, 21.020], [52.244, 21.031], [52.234, 21.044], [52.222, 21.053], [52.210, 21.058], [52.198, 21.064], [52.185, 21.076], [52.165, 21.095]];
  const ROADS = [
    { pts: [[52.229, 20.935], [52.228, 20.990], [52.230, 21.030], [52.233, 21.060], [52.236, 21.095]], big: true }, // Al. Jerozolimskie
    { pts: [[52.285, 21.000], [52.250, 21.010], [52.230, 21.012], [52.210, 21.020], [52.170, 21.023]], big: true }, // oś Marszałkowska / Puławska
    { pts: [[52.243, 20.935], [52.243, 20.995], [52.246, 21.020], [52.252, 21.045], [52.255, 21.095]], big: true }, // Al. Solidarności
    { pts: [[52.270, 20.950], [52.250, 20.985], [52.218, 20.990], [52.190, 20.990], [52.170, 20.995]] }, // obwodnica zachodnia
    { pts: [[52.214, 20.935], [52.214, 21.000], [52.214, 21.054], [52.212, 21.095]] }, // Trasa Łazienkowska
    { pts: [[52.237, 21.000], [52.236, 21.020], [52.236, 21.044]] }, // Świętokrzyska
    { pts: [[52.262, 20.985], [52.262, 21.006], [52.268, 21.040]] }, // Most Gdański
  ];
  const PARKS = [[52.212, 20.996, 18, 12], [52.215, 21.034, 12, 20], [52.243, 21.056, 14, 11], [52.241, 21.007, 8, 7], [52.270, 20.985, 10, 8]];

  function buildMiniMap() {
    const svg = $("#miniMap");
    svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const parks = PARKS.map(([lat, lng, rx, ry]) => {
      const [x, y] = px(lng, lat);
      return `<ellipse class="mm-park" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" />`;
    }).join("");
    const roads = ROADS.map((r, i) => `<path class="mm-road${r.big ? "" : " mm-road-sm"}" d="${pathOf(r.pts)}" style="--d:${300 + i * 120}ms" />`).join("");
    const LABELS = [["Wola", 20.968, 52.226], ["Praga", 21.050, 52.262], ["Mokotów", 21.000, 52.193], ["Żoliborz", 20.968, 52.268]];
    const visible = PLACES.filter((p) => p.lng > B.w && p.lng < B.e && p.lat > B.s && p.lat < B.n)
      .sort((a, b) => b.lat - a.lat);
    const pins = visible.map((p, i) => {
      const [x, y] = px(p.lng, p.lat);
      return `
        <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="mm-pin" data-id="${p.id}" style="--d:${900 + i * 45}ms">
          <circle class="pulse" cx="0" cy="-15" r="12" />
          <g class="pin-body">
            <path class="pin-shape" fill="var(${TYPE[p.type].color})" d="M0 0 C-3 -5 -10 -9 -10 -16 A10 10 0 1 1 10 -16 C10 -9 3 -5 0 0Z" />
            <text x="0" y="-12.5" text-anchor="middle">${p.score}</text>
          </g>
          <title>${esc(p.name)}</title>
        </g></g>`;
    }).join("");

    svg.innerHTML = `
      <rect class="mm-bg" width="${VW}" height="${VH}" />
      ${parks}
      <path class="mm-river" d="${pathOf(VISTULA)}" />
      ${roads}
      ${LABELS.map(([t, lng, lat]) => { const [x, y] = px(lng, lat); return `<text class="mm-label" x="${x}" y="${y}">${t}</text>`; }).join("")}
      ${pins}`;

    // Długości ścieżek do animacji rysowania.
    $$(".mm-road, .mm-river", svg).forEach((el) => el.style.setProperty("--len", Math.ceil(el.getTotalLength())));
    $$(".mm-pin", svg).forEach((g) => g.addEventListener("click", () => { location.href = placeUrl(byId[g.dataset.id]); }));
  }
  const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  buildMiniMap();

  // Karta miejsca przełącza się między najlepszymi miejscami, a pinezka pulsuje.
  const featured = best.filter((p) => p.score >= 4).slice(0, 8);
  const card = $("#placeCard");
  ["#pcType", "#pcOpen", "#pcName", "#pcMeta", ".pc-row"].forEach((s) => $(s, card).classList.add("swap"));

  function showPlace(p) {
    const open = isOpenNow(p);
    const close = open ? closesAt(p) : null;
    $("#pcType").textContent = p.kind || TYPE[p.type].one;
    $("#pcOpen").textContent = open === true ? `● Otwarte${close ? ` do ${close}` : ""}` : open === false ? "Teraz zamknięte" : "";
    $("#pcOpen").style.color = open === true ? "" : "var(--muted)";
    $("#pcName").textContent = p.name;
    $("#pcMeta").textContent = `${p.district} · ${p.address}`;
    $("#pcScore").textContent = p.score;
    $$("#pcBars i").forEach((el, i) => el.classList.toggle("on", i < (p.wifi ?? 0)));
    $$(".mm-pin").forEach((g) => {
      const on = g.dataset.id === p.id;
      g.classList.toggle("is-active", on);
      if (on) g.parentNode.parentNode.appendChild(g.parentNode); // aktywna pinezka na wierzch
    });
  }

  let fi = 0;
  showPlace(featured[0]);
  if (!reduceMotion && featured.length > 1) {
    setTimeout(() => {
      setInterval(() => {
        if (document.hidden) return;
        card.classList.add("is-swapping");
        setTimeout(() => {
          fi = (fi + 1) % featured.length;
          showPlace(featured[fi]);
          card.classList.remove("is-swapping");
        }, 350);
      }, 3200);
    }, 2600);
  }
  card.style.cursor = "pointer";
  card.addEventListener("click", () => { location.href = placeUrl(featured[fi]); });

  // Lekkie przechylenie karty z mapą za kursorem.
  const mapCard = $("#mapCard");
  if (finePointer && !reduceMotion) {
    const hv = $("#heroVisual");
    hv.addEventListener("pointermove", (e) => {
      const r = hv.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      mapCard.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    });
    hv.addEventListener("pointerleave", () => { mapCard.style.transform = ""; });
  }

  /* ───────── Marquee ───────── */

  const mq = best.filter((p) => p.type === "kawiarnia").concat(best.filter((p) => p.type !== "kawiarnia"));
  const items = mq.map((p) => `
    <a class="marquee-item" href="${placeUrl(p)}">
      <i style="background: var(${TYPE[p.type].color})"></i>${esc(p.name)} <small>${esc(p.district)}</small>
    </a>`).join("");
  $("#marquee").innerHTML = items + items.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ');

  /* ───────── Picks ───────── */

  const tagsOf = (p) => [
    p.wifi >= 5 && "Szybkie Wi-Fi",
    p.outlets === "dużo" && "Dużo gniazdek",
    p.noise === "cicho" && "Cicho",
    p.laptop === "tak" && "Laptop OK",
  ].filter(Boolean);
  const picks = best.filter((p) => p.type === "kawiarnia").slice(0, 3);
  $("#picks").innerHTML = picks.map((p, i) => `
    <a class="pick reveal tilt" href="${placeUrl(p)}" style="--d:${i * 90}ms">
      <div class="pick-top">
        <div>
          <h3>${esc(p.name)}</h3>
          <div class="pick-meta">${esc(p.district)} · ${esc(p.address)}</div>
        </div>
        <span class="pick-score">${p.score}/5</span>
      </div>
      <p>${esc(p.why)}</p>
      <div class="pick-tags">${tagsOf(p).map((t) => `<span>${t}</span>`).join("")}</div>
      <span class="pick-go">Zobacz na mapie
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
      </span>
    </a>`).join("");

  if (finePointer && !reduceMotion) {
    $$(".tilt").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-4px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* ───────── Liczby ───────── */

  const districts = new Set(PLACES.map((p) => p.district));

  const COUNTS = {
    total: PLACES.length,
    cafes: PLACES.filter((p) => p.type === "kawiarnia").length,
    quiet: PLACES.filter((p) => p.noise === "cicho").length,
    free: PLACES.filter((p) => p.cost === "bezpłatnie").length,
    districts: districts.size,
  };
  function countUp(el) {
    const target = COUNTS[el.dataset.count] ?? 0;
    if (reduceMotion) { el.textContent = target; return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function drainBattery(el) {
    if (reduceMotion) { el.textContent = "12%"; return; }
    const t0 = performance.now(), dur = 3200;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      el.textContent = `${Math.round(100 - 88 * e)}%`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ───────── Krok 1: kursor klika w filtry ───────── */

  function placeCursor() {
    const art = $(".art-filters");
    const cur = $(".cursor", art);
    if (!art || !cur) return;
    const r0 = art.getBoundingClientRect();
    $$(".tg:not(.tg-off)", art).forEach((t, i) => {
      const r = t.getBoundingClientRect();
      cur.style.setProperty(`--c${i + 1}x`, `${r.left - r0.left + r.width * 0.55}px`);
      cur.style.setProperty(`--c${i + 1}y`, `${r.top - r0.top + r.height * 0.45}px`);
    });
  }
  placeCursor();
  addEventListener("resize", placeCursor);

  /* ───────── Scroll reveal ───────── */

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      el.classList.add("in");
      $$("[data-count]", el).forEach(countUp);
      $$("[data-battery]", el).forEach(drainBattery);
      io.unobserve(el);
    }
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ───────── Magnetyczne przyciski ───────── */

  if (finePointer && !reduceMotion) {
    $$(".magnetic").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`;
      });
      btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
    });
  }
})();

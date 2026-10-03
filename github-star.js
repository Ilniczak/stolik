// Przycisk "gwiazdka na GitHubie" z aktualną liczbą gwiazdek repozytorium.
// Każdy element [data-gh-stars] dostaje liczbę z publicznego API GitHuba.
// Wynik trzymamy godzinę w sessionStorage (limit API bez logowania: 60 zapytań/h na IP).
(() => {
  "use strict";

  const REPO = "Ilniczak/stolik";
  const KEY = `gh-stars:${REPO}`;
  const TTL = 60 * 60 * 1000;
  const targets = document.querySelectorAll("[data-gh-stars]");
  if (!targets.length) return;

  const show = (n) => {
    if (typeof n !== "number") return;
    const text = n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k` : String(n);
    targets.forEach((el) => { el.textContent = text; el.hidden = false; });
  };

  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (cached && Date.now() - cached.at < TTL) { show(cached.n); return; }
  } catch {}

  fetch(`https://api.github.com/repos/${REPO}`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || typeof d.stargazers_count !== "number") return;
      show(d.stargazers_count);
      try { sessionStorage.setItem(KEY, JSON.stringify({ n: d.stargazers_count, at: Date.now() })); } catch {}
    })
    .catch(() => {});
})();

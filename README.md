# stolik

Mapa miejsc do pracy z laptopem w Warszawie: landing (`index.html`), mapa (`mapa.html`) i formularz propozycji (`zaproponuj.html`).

## Lokalnie

```bash
npm install
npm run dev
```

Strona: http://localhost:8765. Bez `DATABASE_URL` propozycje z formularza zapisują się do `.dev/propozycje.json`.
Z plikiem `.env` (wzór w `.env.example`) idą do Neon, tak jak na produkcji.

## Wdrożenie: Vercel + Neon

1. Zaimportuj repozytorium w Vercelu (Framework: Other, bez komendy build).
2. W projekcie: Storage → Create → Neon. Integracja doda zmienną `DATABASE_URL`.
3. W konsoli SQL Neon uruchom `db/schema.sql`.
4. Formularz wysyła `POST /api/propozycje` (funkcja `api/propozycje.js`).

Nowe zgłoszenia:

```sql
select * from propozycje where status = 'nowa' order by created_at desc;
```

Po dodaniu miejsca do `places.js` oznacz zgłoszenie: `update propozycje set status = 'dodana' where id = …;`

Po zmianach w CSS/JS podbij `?v=…` w plikach HTML, żeby przeglądarki pobrały nowe wersje.

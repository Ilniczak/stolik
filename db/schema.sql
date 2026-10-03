-- Propozycje nowych miejsc zgłaszane przez formularz na stronie (zaproponuj.html).
-- Uruchom raz w konsoli SQL Neon albo: psql "$DATABASE_URL" -f db/schema.sql

create table if not exists propozycje (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  status      text not null default 'nowa' check (status in ('nowa', 'dodana', 'odrzucona')),
  name        text not null check (char_length(name) between 2 and 120),
  address     text not null check (char_length(address) between 3 and 160),
  district    text check (char_length(district) <= 60),
  type        text not null check (type in ('kawiarnia', 'coworking', 'biblioteka', 'darmowe')),
  wifi        smallint check (wifi between 1 and 5),
  outlets     text check (outlets in ('dużo', 'średnio', 'mało')),
  noise       text check (noise in ('cicho', 'umiarkowanie', 'gwarno')),
  laptop      text check (laptop in ('tak', 'ograniczenia')),
  note        text check (char_length(note) <= 1000)
);

-- Przegląd nowych zgłoszeń: select * from propozycje where status = 'nowa' order by created_at desc;
create index if not exists propozycje_status_created_idx on propozycje (status, created_at desc);

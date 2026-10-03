// POST /api/propozycje — zapisuje propozycję nowego miejsca w Neon (Postgres).
// Wymaga zmiennej środowiskowej DATABASE_URL (dodaje ją integracja Neon w Vercelu).
import { neon } from "@neondatabase/serverless";
import { createHandler } from "./_lib/propozycja.js";

export const POST = createHandler(async (d) => {
  if (!process.env.DATABASE_URL) throw new Error("Brak zmiennej DATABASE_URL");
  const sql = neon(process.env.DATABASE_URL);
  await sql`
    insert into propozycje (name, address, district, type, wifi, outlets, noise, laptop, note)
    values (${d.name}, ${d.address}, ${d.district}, ${d.type}, ${d.wifi}, ${d.outlets}, ${d.noise}, ${d.laptop}, ${d.note})
  `;
});

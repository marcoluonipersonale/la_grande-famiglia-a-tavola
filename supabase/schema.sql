-- La Grande Famiglia a Tavola — schema sul progetto Supabase "nosplash" (tabelle tav_, separate da NoSplash).
-- Applicato come migrazioni: tavola_schema, tavola_colonne_modificabili, tavola_piano_base, tavola_unisciti_admin.

create table public.tav_famiglie (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codice text not null unique,
  created_at timestamptz not null default now()
);

create table public.tav_membri (
  user_id uuid primary key references auth.users(id) on delete cascade,
  famiglia_id uuid not null references public.tav_famiglie(id) on delete cascade,
  nome text not null,
  colore text not null default '#2F7A4D',
  ruolo text not null default 'membro' check (ruolo in ('admin','membro')),
  altezza_cm numeric, anno_nascita int, obiettivo_kg numeric, kcal_giorno int, preferenze text,
  condividi_progressi boolean not null default false,
  ics_token uuid not null default gen_random_uuid() unique,   -- link personale del calendario promemoria
  created_at timestamptz not null default now()
);

create table public.tav_pasti (
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.tav_famiglie(id) on delete cascade,
  giorno date not null,
  momento text not null check (momento in ('colazione','spuntino_mattina','pranzo','spuntino_pomeriggio','cena','dopo_cena')),
  testo text not null, note text, fatto boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tav_uscite (            -- i giri di spesa (spesa frazionata)
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.tav_famiglie(id) on delete cascade,
  giorno date not null, titolo text not null, fatta boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tav_spesa (
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.tav_famiglie(id) on delete cascade,
  nome text not null, quantita text, reparto text not null default 'Altro',
  serve_il date,                                                   -- quando va in tavola
  uscita_id uuid references public.tav_uscite(id) on delete set null,
  stato text not null default 'da_comprare' check (stato in ('da_comprare','preso','in_casa')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tav_pesate (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  giorno date not null default current_date,
  peso_kg numeric, grasso_pct numeric, vita_cm numeric, note text,
  created_at timestamptz not null default now()
);

create table public.tav_attivita (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  giorno date not null default current_date,
  tipo text not null, durata_min int, km numeric, kcal int, note text,
  created_at timestamptz not null default now()
);

create table public.tav_chat (               -- conversazioni con Claude (scritte solo dalla funzione tav-chiedi)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ruolo text not null check (ruolo in ('user','assistant')),
  testo text not null,
  created_at timestamptz not null default now()
);

-- Regole di accesso (riassunto)
-- tav_famiglie / tav_membri: si vede solo la propria famiglia; ognuno modifica solo il proprio profilo
--   (colonne: nome, colore, altezza, anno, obiettivo, kcal, preferenze, condividi); l'admin rinomina la famiglia.
-- tav_pasti / tav_uscite / tav_spesa: tutto in comune dentro la famiglia (famiglia_id = tav_mia_famiglia()).
-- tav_pesate / tav_attivita: lettura se proprie o di un familiare che condivide (tav_puo_vedere), scrittura solo proprie.
-- tav_chat: lettura e cancellazione solo proprie; scrittura solo dal server.
-- Funzioni: tav_mia_famiglia(), tav_puo_vedere(uuid), tav_unisciti(codice, nome), tav_nuovo_token_calendario(),
--           tav_carica_piano_base(lunedi) = settimana tipo del piano.

-- Funzioni sul server (supabase/functions):
-- tav-registrati  registrazione con codice famiglia (account già confermato)
-- tav-calendario  feed iCalendar personale con i promemoria (?t=token)
-- tav-chiedi      Chiedi a Claude, solo alimentazione/spesa/benessere; serve il segreto ANTHROPIC_API_KEY

-- Migrazione tavola_ingredienti: ingredienti di ogni pasto (spesa per giorno, tasto "Manca")
-- create table public.tav_ingredienti (id, famiglia_id, pasto_id -> tav_pasti on delete cascade, nome, quantita, ordine, created_at)
-- RLS: tutto in comune dentro la famiglia. tav_spesa.ingrediente_id collega una voce della lista all'ingrediente.

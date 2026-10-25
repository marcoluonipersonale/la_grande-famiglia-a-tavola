// La Grande Famiglia a Tavola: registrazione solo con codice famiglia.
// L'account nasce già confermato (niente email da cliccare), ma senza codice valido non si entra.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ errore: 'Metodo non ammesso' }, 405);
  let d: any;
  try { d = await req.json(); } catch { return json({ errore: 'Richiesta non valida' }, 400); }
  const email = String(d.email || '').trim().toLowerCase();
  const password = String(d.password || '');
  const nome = String(d.nome || '').trim().slice(0, 40);
  const codice = String(d.codice || '').trim().toUpperCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ errore: "Controlla l'email" }, 400);
  if (password.length < 8) return json({ errore: 'La password deve avere almeno 8 caratteri' }, 400);
  if (!nome) return json({ errore: 'Scrivi il tuo nome' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: fam } = await admin.from('tav_famiglie').select('id').eq('codice', codice).maybeSingle();
  if (!fam) return json({ errore: 'Codice famiglia non valido: chiedilo a chi ha creato la famiglia' }, 403);
  const { count } = await admin.from('tav_membri').select('user_id', { count: 'exact', head: true }).eq('famiglia_id', fam.id);
  if ((count ?? 0) >= 10) return json({ errore: 'La famiglia è al completo' }, 403);

  const { data: creato, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: nome } });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return json({ errore: 'Esiste già un account con questa email (forse di NoSplash): accedi con quella password e inserisci il codice famiglia.', esiste: true }, 409);
    return json({ errore: error.message }, 400);
  }
  const { error: e2 } = await admin.from('tav_membri').insert({ user_id: creato.user.id, famiglia_id: fam.id, nome, ruolo: (count ?? 0) === 0 ? 'admin' : 'membro' });
  if (e2) return json({ errore: e2.message }, 500);
  return json({ ok: true });
});

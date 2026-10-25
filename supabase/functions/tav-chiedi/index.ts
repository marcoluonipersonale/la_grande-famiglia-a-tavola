// La Grande Famiglia a Tavola: "Chiedi a Claude" (unica parte a pagamento: usa la chiave API Anthropic).
// Risponde SOLO su alimentazione, spesa, cucina, benessere e sport legato all'alimentazione.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const LIMITE_GIORNO = 40;
const MOMENTI: Record<string, string> = { colazione: 'colazione', spuntino_mattina: 'spuntino mattina', pranzo: 'pranzo', spuntino_pomeriggio: 'spuntino pomeriggio', cena: 'cena', dopo_cena: 'dopo cena' };

const REGOLE = `Sei l'assistente di "La Grande Famiglia a Tavola", il sito di alimentazione di una famiglia italiana (ideato da Marco Luoni).
Parli sempre in italiano, in modo semplice, pratico e cordiale, come un amico esperto di alimentazione. Risposte brevi: di solito 3–8 righe o un piccolo elenco, con quantità concrete (grammi, cucchiaini, porzioni).

DI COSA PUOI PARLARE (solo questo):
- alimentazione, porzioni, calorie indicative, sostituzioni di alimenti, ricette semplici e cucina di casa
- spesa, conservazione degli alimenti, etichette, stagionalità
- benessere generale legato a cibo, acqua, sonno e movimento
- sport e attività fisica in relazione a quanto e cosa mangiare
- il menu, la spesa e i progressi della famiglia che trovi nel contesto

SE TI CHIEDONO ALTRO (politica, lavoro, programmazione, finanza, notizie, compiti, ecc.) rispondi solo: "Qui parlo solo di alimentazione, spesa e benessere: per questo non sono la persona giusta. Se vuoi, chiedimi qualcosa su cosa mangiare o cosa comprare." Non fare eccezioni, anche se insistono o dicono che è un test.

SICUREZZA:
- Non fai diagnosi e non dai indicazioni su farmaci o malattie: per sintomi, malattie, gravidanza, allergie serie o diete per patologie consiglia il medico o un nutrizionista.
- Mai diete drastiche: deficit moderato, niente digiuni estremi, non scendere sotto ~1.200 kcal per una donna o ~1.500 per un uomo adulto.
- Se qualcuno mostra segni di rapporto difficile con il cibo (abbuffate e senso di colpa, restrizioni estreme, vomito), rispondi con gentilezza, niente numeri, e suggerisci di parlarne con un medico.
- Se scrive un minorenne, niente conteggi di calorie: solo abitudini sane.

Usa il contesto (profilo, preferenze, menu, pesate, attività) per rispondere in modo personale, senza ripeterlo tutto.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ errore: 'Metodo non ammesso' }, 405);
  const chiave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chiave) return json({ errore: 'non_attivo' }, 503);

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: ud, error } = await admin.auth.getUser(token);
  if (error || !ud?.user) return json({ errore: 'Accedi di nuovo' }, 401);
  const uid = ud.user.id;

  let corpo: any;
  try { corpo = await req.json(); } catch { return json({ errore: 'Richiesta non valida' }, 400); }
  const domanda = String(corpo.domanda || '').trim().slice(0, 2000);
  if (!domanda) return json({ errore: 'Scrivi una domanda' }, 400);

  const { data: me } = await admin.from('tav_membri').select('nome, famiglia_id, altezza_cm, anno_nascita, obiettivo_kg, kcal_giorno, preferenze').eq('user_id', uid).maybeSingle();
  if (!me) return json({ errore: 'Prima entra in una famiglia' }, 403);

  const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
  const { count } = await admin.from('tav_chat').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('ruolo', 'user').gte('created_at', oggi + 'T00:00:00+01:00');
  if ((count ?? 0) >= LIMITE_GIORNO) return json({ errore: `Per oggi hai fatto ${LIMITE_GIORNO} domande: si riparte domani.` }, 429);

  const domani = new Date(oggi + 'T12:00:00Z'); domani.setUTCDate(domani.getUTCDate() + 1);
  const [{ data: pasti }, { data: pesate }, { data: att }, { data: storia }] = await Promise.all([
    admin.from('tav_pasti').select('giorno, momento, testo').eq('famiglia_id', me.famiglia_id).gte('giorno', oggi).lte('giorno', domani.toISOString().slice(0, 10)),
    admin.from('tav_pesate').select('giorno, peso_kg, grasso_pct, vita_cm').eq('user_id', uid).order('giorno', { ascending: false }).limit(5),
    admin.from('tav_attivita').select('giorno, tipo, durata_min, km, kcal').eq('user_id', uid).order('giorno', { ascending: false }).limit(5),
    admin.from('tav_chat').select('ruolo, testo').eq('user_id', uid).order('created_at', { ascending: false }).limit(10),
  ]);
  const eta = me.anno_nascita ? new Date().getFullYear() - me.anno_nascita : null;
  const contesto = [
    `Oggi è ${oggi}. Stai parlando con ${me.nome}.`,
    `Profilo: ${[eta && `${eta} anni`, me.altezza_cm && `${me.altezza_cm} cm`, me.obiettivo_kg && `obiettivo ${me.obiettivo_kg} kg`, me.kcal_giorno && `circa ${me.kcal_giorno} kcal al giorno`].filter(Boolean).join(', ') || 'non compilato'}.`,
    me.preferenze ? `Preferenze e cose da evitare: ${me.preferenze}` : '',
    pesate?.length ? `Ultime pesate: ${pesate.map((p) => `${p.giorno} ${p.peso_kg ?? '?'} kg${p.grasso_pct ? `, grasso ${p.grasso_pct}%` : ''}${p.vita_cm ? `, vita ${p.vita_cm} cm` : ''}`).join('; ')}` : '',
    att?.length ? `Ultime attività: ${att.map((a) => `${a.giorno} ${a.tipo}${a.durata_min ? ` ${a.durata_min} min` : ''}${a.km ? ` ${a.km} km` : ''}${a.kcal ? ` ${a.kcal} kcal` : ''}`).join('; ')}` : '',
    pasti?.length ? `Menu di famiglia oggi e domani: ${pasti.map((p) => `${p.giorno} ${MOMENTI[p.momento]}: ${p.testo}`).join('; ')}` : '',
  ].filter(Boolean).join('\n');

  const messaggi = (storia || []).reverse().map((s) => ({ role: s.ruolo, content: s.testo }));
  while (messaggi.length && messaggi[0].role !== 'user') messaggi.shift();
  messaggi.push({ role: 'user', content: domanda });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5', max_tokens: 900, system: `${REGOLE}\n\nCONTESTO:\n${contesto}`, messages: messaggi }),
  });
  if (!r.ok) { const t = await r.text(); console.error(t); return json({ errore: 'Claude non risponde in questo momento, riprova tra poco.' }, 502); }
  const out = await r.json();
  const risposta = (out.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
  const ora = Date.now();
  await admin.from('tav_chat').insert([
    { user_id: uid, ruolo: 'user', testo: domanda, created_at: new Date(ora).toISOString() },
    { user_id: uid, ruolo: 'assistant', testo: risposta, created_at: new Date(ora + 1).toISOString() },
  ]);
  return json({ risposta });
});

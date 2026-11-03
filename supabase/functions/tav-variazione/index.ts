// La Grande Famiglia a Tavola: "Ho mangiato qualcosa di diverso".
// Riceve una variazione scritta a parole, la confronta con il pasto del menu,
// stima la differenza, l'effetto sulla bilancia e propone come sistemare i pasti successivi.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const MOMENTI: Record<string, string> = { colazione: 'colazione', spuntino_mattina: 'spuntino di metà mattina', pranzo: 'pranzo', spuntino_pomeriggio: 'merenda', cena: 'cena', dopo_cena: 'dopo cena' };
const ORDINE = Object.keys(MOMENTI);
const LIMITE_GIORNO = 20;

const REGOLE = `Sei il nutrizionista pratico del sito di famiglia "La Grande Famiglia a Tavola". Parli italiano semplice, tono amichevole e mai colpevolizzante.
Una persona ti dice che a un pasto ha mangiato qualcosa di diverso dal menu. Tu:
1. stimi in modo realistico le calorie del pasto previsto e di quello mangiato, per UNA persona e con le porzioni indicate (se la porzione non è detta, ipotizza una porzione normale e dillo);
2. spieghi in 1–2 frasi l'effetto probabile sulla bilancia del giorno dopo, distinguendo acqua, sale, carboidrati e contenuto dell'intestino dal grasso vero (1 kg di grasso ≈ 7.000 kcal);
3. dai un commento breve e incoraggiante, con al massimo un consiglio pratico;
4. solo se la differenza è grande (oltre ~300 kcal in più, oppure mancano molte proteine o verdure) proponi al massimo 2 aggiustamenti a pasti FUTURI del menu che ti do: stesso piatto con porzione diversa o una piccola aggiunta/riduzione, mai digiuni o pasti saltati, mai sotto ~1.500 kcal al giorno. Se non serve, nessun aggiustamento.
Se emergono segni di rapporto difficile con il cibo, niente numeri: solo gentilezza e il consiglio di parlarne con il medico.

Sii breve: "riassunto" una frase, "bilancia" al massimo 2 frasi, "commento" al massimo 3 frasi.
Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo e senza blocchi di codice, con queste chiavi:
{"riassunto": "cosa ha mangiato, in poche parole",
 "kcal_previste": numero o null,
 "kcal_mangiate": numero,
 "differenza": numero (mangiate - previste, 0 se non c'era un pasto previsto la differenza è uguale alle kcal mangiate),
 "bilancia": "effetto probabile sulla pesata di domani",
 "commento": "2-3 frasi",
 "aggiustamenti": [{"giorno": "AAAA-MM-GG", "momento": "uno di: colazione, spuntino_mattina, pranzo, spuntino_pomeriggio, cena, dopo_cena", "testo_nuovo": "il testo completo del pasto aggiornato", "perche": "motivo breve"}]}`;

// Legge la risposta di Claude anche se il JSON è incompleto o circondato da testo.
function leggiAnalisi(grezzo: string): any {
  try { const a = JSON.parse(grezzo.slice(grezzo.indexOf('{'), grezzo.lastIndexOf('}') + 1)); if (a && typeof a === 'object') return a; } catch { /* sotto il recupero */ }
  const testo = (k: string) => { const m = grezzo.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`)); return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim() : undefined; };
  const numero = (k: string) => { const m = grezzo.match(new RegExp(`"${k}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`)); return m ? Number(m[1]) : null; };
  const a: any = { riassunto: testo('riassunto'), kcal_previste: numero('kcal_previste'), kcal_mangiate: numero('kcal_mangiate'), differenza: numero('differenza'), bilancia: testo('bilancia'), commento: testo('commento') };
  if (!a.riassunto && !a.commento && !a.bilancia) a.commento = grezzo.replace(/[{}"\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  return a;
}

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
  const testo = String(corpo.testo || '').trim().slice(0, 1000);
  const giorno = String(corpo.giorno || '');
  const momento = String(corpo.momento || '');
  if (!testo) return json({ errore: 'Scrivi cosa hai mangiato' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !MOMENTI[momento]) return json({ errore: 'Giorno o pasto non valido' }, 400);

  const { data: me } = await admin.from('tav_membri').select('nome, famiglia_id, altezza_cm, anno_nascita, obiettivo_kg, kcal_giorno, preferenze').eq('user_id', uid).maybeSingle();
  if (!me) return json({ errore: 'Prima entra in una famiglia' }, 403);

  const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
  const { count } = await admin.from('tav_variazioni').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', oggi + 'T00:00:00+01:00');
  if ((count ?? 0) >= LIMITE_GIORNO) return json({ errore: 'Per oggi hai già segnato tante variazioni: si riparte domani.' }, 429);

  const fine = new Date(oggi + 'T12:00:00Z'); fine.setUTCDate(fine.getUTCDate() + 2);
  const [{ data: previsto }, { data: futuri }, { data: pesate }, { data: altre }] = await Promise.all([
    admin.from('tav_pasti').select('id, testo').eq('famiglia_id', me.famiglia_id).eq('giorno', giorno).eq('momento', momento).maybeSingle(),
    admin.from('tav_pasti').select('giorno, momento, testo').eq('famiglia_id', me.famiglia_id).gte('giorno', giorno < oggi ? oggi : giorno).lte('giorno', fine.toISOString().slice(0, 10)),
    admin.from('tav_pesate').select('giorno, peso_kg, grasso_pct').eq('user_id', uid).order('giorno', { ascending: false }).limit(4),
    admin.from('tav_variazioni').select('giorno, momento, testo').eq('user_id', uid).gte('giorno', giorno).order('created_at').limit(10),
  ]);
  const dopo = (futuri || [])
    .filter((p) => p.giorno > giorno || (p.giorno === giorno && ORDINE.indexOf(p.momento) > ORDINE.indexOf(momento)))
    .filter((p) => p.giorno > oggi || p.giorno === oggi)
    .sort((a, b) => a.giorno.localeCompare(b.giorno) || ORDINE.indexOf(a.momento) - ORDINE.indexOf(b.momento))
    .slice(0, 10);
  const eta = me.anno_nascita ? new Date().getFullYear() - me.anno_nascita : null;
  const contesto = [
    `Oggi è ${oggi}. Persona: ${me.nome}${eta ? `, ${eta} anni` : ''}${me.altezza_cm ? `, ${me.altezza_cm} cm` : ''}${me.obiettivo_kg ? `, obiettivo ${me.obiettivo_kg} kg` : ''}${me.kcal_giorno ? `, circa ${me.kcal_giorno} kcal al giorno` : ''}.`,
    me.preferenze ? `Preferenze: ${me.preferenze}` : '',
    pesate?.length ? `Ultime pesate: ${pesate.map((p) => `${p.giorno} ${p.peso_kg} kg${p.grasso_pct ? ` (${p.grasso_pct}% grasso)` : ''}`).join('; ')}.` : '',
    `Pasto: ${MOMENTI[momento]} del ${giorno}. Nel menu era previsto: ${previsto?.testo || 'niente (pasto fuori programma)'}.`,
    altre?.length ? `Altre variazioni già segnate da quel giorno: ${altre.map((a) => `${a.giorno} ${MOMENTI[a.momento]}: ${a.testo}`).join('; ')}.` : '',
    dopo.length ? `Pasti futuri del menu che puoi aggiustare: ${dopo.map((p) => `${p.giorno} ${p.momento}: ${p.testo}`).join(' | ')}.` : 'Non ci sono pasti futuri nel menu.',
  ].filter(Boolean).join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5', max_tokens: 1600, system: `${REGOLE}\n\nCONTESTO:\n${contesto}`, messages: [{ role: 'user', content: `Ecco cosa ho mangiato invece: ${testo}` }] }),
  });
  if (!r.ok) { console.error(await r.text()); return json({ errore: 'Claude non risponde in questo momento, riprova tra poco.' }, 502); }
  const out = await r.json();
  const grezzo = (out.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  const analisi: any = leggiAnalisi(grezzo);
  // tieni solo aggiustamenti su pasti futuri che esistono davvero
  const validi = new Set(dopo.map((p) => `${p.giorno}|${p.momento}`));
  analisi.aggiustamenti = (Array.isArray(analisi.aggiustamenti) ? analisi.aggiustamenti : [])
    .filter((a: any) => a && validi.has(`${a.giorno}|${a.momento}`) && typeof a.testo_nuovo === 'string' && a.testo_nuovo.trim())
    .slice(0, 2);

  const { data: riga, error: e2 } = await admin.from('tav_variazioni').insert({
    user_id: uid, famiglia_id: me.famiglia_id, giorno, momento, pasto_id: previsto?.id || null, testo, analisi,
  }).select().single();
  if (e2) { console.error(e2); return json({ errore: 'Non riesco a salvare, riprova.' }, 500); }
  return json({ variazione: riga });
});

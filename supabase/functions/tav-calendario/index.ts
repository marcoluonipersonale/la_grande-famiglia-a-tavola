// La Grande Famiglia a Tavola: calendario personale con promemoria (feed iCalendar).
// Il telefono si iscrive a questo indirizzo e manda da solo le notifiche: cosa si mangia oggi,
// cosa si mangia domani, cosa manca da comprare e quando si va a fare la spesa.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const MOMENTI: Record<string, string> = {
  colazione: 'Colazione', spuntino_mattina: 'Spuntino di metà mattina', pranzo: 'Pranzo',
  spuntino_pomeriggio: 'Spuntino del pomeriggio', cena: 'Cena', dopo_cena: 'Dopo cena',
};
const ORDINE = Object.keys(MOMENTI);
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const nCose = (n: number) => (n === 1 ? '1 cosa' : `${n} cose`);

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function piega(riga: string) {
  const out: string[] = [];
  let r = riga;
  const enc = new TextEncoder();
  while (enc.encode(r).length > 74) {
    let n = 74;
    while (enc.encode(r.slice(0, n)).length > 74) n--;
    out.push(r.slice(0, n));
    r = ' ' + r.slice(n);
  }
  out.push(r);
  return out.join('\r\n');
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const compatto = (giorno: string, ora: string) => giorno.replace(/-/g, '') + 'T' + ora.replace(':', '') + '00';
function piu(giorno: string, n: number) { const d = new Date(giorno + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
function nomeGiorno(giorno: string) { const d = new Date(giorno + 'T12:00:00Z'); return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()}`; }

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response('Link non valido', { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: m } = await admin.from('tav_membri').select('user_id, famiglia_id, nome').eq('ics_token', token).maybeSingle();
  if (!m) return new Response('Link non valido o rinnovato', { status: 404 });

  const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
  const da = piu(oggi, -2), a = piu(oggi, 14);
  const [{ data: pasti }, { data: spesa }, { data: uscite }] = await Promise.all([
    admin.from('tav_pasti').select('giorno, momento, testo').eq('famiglia_id', m.famiglia_id).gte('giorno', da).lte('giorno', a),
    admin.from('tav_spesa').select('nome, quantita, serve_il, uscita_id, stato').eq('famiglia_id', m.famiglia_id).eq('stato', 'da_comprare'),
    admin.from('tav_uscite').select('id, giorno, titolo, fatta').eq('famiglia_id', m.famiglia_id).gte('giorno', da).lte('giorno', a),
  ]);

  const perGiorno = new Map<string, any[]>();
  for (const p of pasti || []) { if (!perGiorno.has(p.giorno)) perGiorno.set(p.giorno, []); perGiorno.get(p.giorno)!.push(p); }
  const descrizioneGiorno = (g: string) => (perGiorno.get(g) || [])
    .sort((x, y) => ORDINE.indexOf(x.momento) - ORDINE.indexOf(y.momento))
    .map((p) => `${MOMENTI[p.momento]}: ${p.testo}`).join('\n');
  const cena = (g: string) => (perGiorno.get(g) || []).find((p) => p.momento === 'cena')?.testo;
  const voce = (s: any) => `• ${s.nome}${s.quantita ? ' (' + s.quantita + ')' : ''}`;
  const daComprarePer = (g: string) => (spesa || []).filter((s) => s.serve_il === g).map(voce);

  const ev: string[] = [];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const evento = (uid: string, giorno: string, inizio: string, fine: string, titolo: string, desc: string) => {
    ev.push(['BEGIN:VEVENT', `UID:${uid}@grande-famiglia-a-tavola`, `DTSTAMP:${stamp}`,
      `DTSTART:${compatto(giorno, inizio)}`, `DTEND:${compatto(giorno, fine)}`,
      piega(`SUMMARY:${esc(titolo)}`), piega(`DESCRIPTION:${esc(desc)}`), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', piega(`DESCRIPTION:${esc(titolo)}`), 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  };

  for (let i = -2; i <= 14; i++) {
    const g = piu(oggi, i);
    if (perGiorno.has(g)) {
      const c = cena(g);
      evento(`oggi-${g}-${m.user_id}`, g, '07:00', '07:10', c ? `Oggi a tavola · stasera ${c.split(',')[0]}` : 'Oggi a tavola', descrizioneGiorno(g));
    }
    const domani = piu(g, 1);
    if (perGiorno.has(domani)) {
      const manca = daComprarePer(domani);
      const titolo = manca.length ? `Domani a tavola · ${manca.length === 1 ? 'manca 1 cosa' : `mancano ${manca.length} cose`}` : 'Domani a tavola';
      const desc = descrizioneGiorno(domani) + (manca.length ? `\n\nDa comprare per domani:\n${manca.join('\n')}` : '\n\nPer domani hai già tutto.');
      evento(`domani-${g}-${m.user_id}`, g, '20:30', '20:40', titolo, desc);
    }
  }
  for (const u of uscite || []) {
    if (u.fatta) continue;
    const lista = (spesa || []).filter((s) => s.uscita_id === u.id).map(voce);
    if (!lista.length) continue;
    evento(`spesa-${u.id}`, u.giorno, '09:00', '09:30', `Spesa: ${u.titolo} (${nCose(lista.length)})`, `Uscita di ${nomeGiorno(u.giorno)}.\n\n${lista.join('\n')}\n\nSpunta tutto dal sito mentre compri.`);
  }

  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Marco Luoni//La Grande Famiglia a Tavola//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    piega(`X-WR-CALNAME:${esc('A tavola · ' + m.nome)}`), 'X-WR-TIMEZONE:Europe/Rome', 'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H',
    ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="a-tavola.ics"' } });
});

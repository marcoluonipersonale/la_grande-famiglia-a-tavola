// La Grande Famiglia a Tavola — by Marco Luoni
// Menu di famiglia, lista della spesa per giorni, promemoria nel calendario del telefono,
// progressi personali, sport e "Chiedi a Claude" (solo alimentazione, spesa e benessere).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, VERSIONE, DATA_VERSIONE } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const app = document.getElementById('app');

const S = {
  sessione: null, me: null, famiglia: null, membri: [],
  lunedi: null, spuntini: true, giorniSpesa: null, spuntatiOra: null,
  chatNonAttiva: false,
};

// ---------------------------------------------------------------- utilità
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MOMENTI = [
  ['colazione', 'Colazione'], ['spuntino_mattina', 'Metà mattina'], ['pranzo', 'Pranzo'],
  ['spuntino_pomeriggio', 'Pomeriggio'], ['cena', 'Cena'], ['dopo_cena', 'Dopo cena'],
];
const NOME_MOMENTO = Object.fromEntries(MOMENTI);
const ORDINE_MOMENTO = Object.fromEntries(MOMENTI.map(([k], i) => [k, i]));
const SPUNTINI = new Set(['spuntino_mattina', 'spuntino_pomeriggio', 'dopo_cena']);
const REPARTI = ['Verdura', 'Frutta', 'Carne e pesce', 'Salumi', 'Pane e colazione', 'Dispensa', 'Spuntini', 'Frigo e altro', 'Casa', 'Altro'];
const COLORI = ['#2F7A4D', '#F39A2E', '#9B2D5C', '#2C6E91', '#7A5BA6', '#C2410C'];
const TIPI_SPORT = ['Bici / e-bike', 'Camminata', 'Corsa', 'Palestra', 'Nuoto', 'Calcetto', 'Yoga e stretching', 'Altro'];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daYmd = (s) => { const [y, m, g] = s.split('-').map(Number); return new Date(y, m - 1, g, 12); };
const piuGiorni = (s, n) => { const d = daYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const oggi = () => ymd(new Date());
const lunediDi = (s) => { const d = daYmd(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymd(d); };
const dataLunga = (s) => { const d = daYmd(s); return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`; };
const dataMedia = (s) => { const d = daYmd(s); return `${GIORNI[d.getDay()]} ${d.getDate()}`; };
const dataBreve = (s) => { const d = daYmd(s); return `${GIORNI_BREVI[d.getDay()]} ${d.getDate()}`; };
const dataConMese = (s) => { const d = daYmd(s); return `${GIORNI_BREVI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()].slice(0, 3)}`; };
const maiuscola = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (v, dec = 1) => (v == null || v === '' ? '–' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: dec }));
const nCose = (n) => (n === 1 ? '1 cosa' : `${n} cose`);
const iniziale = (s) => (s || '?').trim().charAt(0).toUpperCase();

function avviso(testo) {
  const el = document.getElementById('avviso');
  el.textContent = testo;
  el.classList.add('visibile');
  clearTimeout(avviso.t);
  avviso.t = setTimeout(() => el.classList.remove('visibile'), 2600);
}
function errore(e) { console.error(e); avviso(e?.message ? `Qualcosa non va: ${e.message}` : 'Qualcosa non va, riprova'); }

function indovinaReparto(nome) {
  const n = nome.toLowerCase();
  const regole = [
    ['Frutta', /mel[ae]|per[ae]\b|banan|mandarin|arance|arancia|uva|frutt|limon|cachi|kiwi|fragol|pesc[he]|albicoc/],
    ['Verdura', /zucc|cavol|broccol|porr|spinac|radicch|finocch|carot|sedan|cetriol|valerian|rucola|insalat|patat|cipoll|aglio|pomodor|zucchin|verdur|minestron|biet|verza|carciof|funghi|melanzan|peperon|lattuga|rosmarin|basilic|prezzemol/],
    ['Carne e pesce', /pollo|tacchino|manzo|vitello|maiale|macinat|arrost|salmon|merluzz|orat|branzin|tonno fresco|gamber|pesce|uova|uovo|spigol/],
    ['Salumi', /bresaol|prosciutt|fesa|speck|salam|mortadell/],
    ['Pane e colazione', /pane|fette|biscott|cereal|avena|marmellat|miele|piadin|gallett|soia|latte|caff|burro d.arachid|crackers|grissin/],
    ['Spuntini', /mandorl|noci|nocciol|ceci tostat|hummus|cioccolat|tisan|\btè\b|\bte\b|pistacch/],
    ['Dispensa', /pasta|riso|farro|orzo|ceci|fagiol|lenticch|tonno|passata|brodo|olio|sale|aceto|spezie|legum|sgombro|farina/],
    ['Frigo e altro', /grana|parmigian|formagg|yogurt|ricott|mozzarell|vino|birra|acqua/],
    ['Casa', /detersiv|carta|sapone|spugn|sacchett|scottex|pellicol/],
  ];
  for (const [r, re] of regole) if (re.test(n)) return r;
  return 'Altro';
}

async function chiama(funzione, corpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${funzione}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}` },
    body: JSON.stringify(corpo),
  });
  let dati = {};
  try { dati = await r.json(); } catch { /* risposta vuota */ }
  return { ok: r.ok, status: r.status, dati };
}

// ---------------------------------------------------------------- disegni
const LOGO = '<img class="logo" src="icons/logo.svg" alt="" width="42" height="42">';
const SIGILLO = '<svg class="sigillo" viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"><circle cx="60" cy="60" r="46"/><path d="M34 22.05V97.95M86 22.05V97.95M34 60H86M34 22.05L86 97.95M86 22.05L60 60"/></g><circle class="punto" cx="60" cy="60" r="15"/></svg>';
const FIRMA = `<footer class="firma">${SIGILLO}<span>Ideata e realizzata da <b>Marco Luoni</b><br><span class="piccolo">La Grande Famiglia a Tavola ${VERSIONE} · ${DATA_VERSIONE}</span></span></footer>`;
const ICONE = {
  oggi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle class="piatto" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg>',
  settimana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect class="piatto" x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/></svg>',
  spesa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path class="piatto" d="M5 8h14l-1.3 10.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 8a3 3 0 0 1 6 0M9.5 13l1.7 1.7L15 11"/></svg>',
  chiedi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path class="piatto" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>',
  io: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle class="piatto" cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-3.7 4-5.5 7.5-5.5s6.3 1.8 7.5 5.5"/></svg>',
  guida: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8v.2"/></svg>',
  famiglia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 19c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6M15.5 14.6c2.5-.2 4.5 1.1 5.3 3.6"/></svg>',
  indietro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  avanti: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  microfono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  altoparlante: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  invia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
};

function barra(attiva) {
  const voci = [['oggi', 'Oggi'], ['settimana', 'Settimana'], ['spesa', 'Spesa'], ['chiedi', 'Chiedi'], ['io', 'Io']];
  return `<nav class="barra" aria-label="Sezioni"><ul>${voci.map(([k, t]) => `<li><a href="#/${k}"${k === attiva ? ' aria-current="page"' : ''}>${ICONE[k]}<span>${t}</span></a></li>`).join('')}</ul></nav>`;
}
function testata(titolo, sopra = '', { indietro = '', extra = true } = {}) {
  const sx = indietro ? `<a class="icona-btn" href="${indietro}" aria-label="Indietro">${ICONE.indietro}</a>` : LOGO;
  const dx = extra ? `<a class="icona-btn" href="#/famiglia" aria-label="Famiglia">${ICONE.famiglia}</a><a class="icona-btn" href="#/guida" aria-label="Guida">${ICONE.guida}</a>` : '';
  return `<header class="testata">${sx}<div class="titoli">${sopra ? `<small>${sopra}</small>` : ''}<h1>${titolo}</h1></div>${dx}</header>`;
}
function pagina(attiva, contenuto) {
  app.innerHTML = `<main class="pagina">${contenuto}</main>${barra(attiva)}`;
  window.scrollTo(0, 0);
}

// finestra modale: restituisce i valori del modulo o null
function finestra(html, { onApri } = {}) {
  return new Promise((risolvi) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog">${html}</form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form');
    let esito = null;
    f.addEventListener('submit', (e) => {
      const azione = e.submitter?.value || 'ok';
      if (azione === 'annulla') { esito = null; return; }
      if (!f.checkValidity()) { e.preventDefault(); f.reportValidity(); return; }
      esito = { azione, ...Object.fromEntries(new FormData(f)) };
    });
    d.addEventListener('close', () => { d.remove(); risolvi(esito); });
    d.showModal();
    onApri?.(d);
  });
}
const conferma = async (testo, si = 'Sì') => !!(await finestra(`<h2>${esc(testo)}</h2><div class="azioni"><button class="btn secondario" value="annulla" formnovalidate>No</button><button class="btn" value="ok">${esc(si)}</button></div>`));

// ---------------------------------------------------------------- dati
async function caricaMe() {
  const uid = S.sessione.user.id;
  const { data: me, error } = await sb.from('tav_membri').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  S.me = me;
  if (!me) return;
  const [{ data: fam }, { data: membri }] = await Promise.all([
    sb.from('tav_famiglie').select('*').eq('id', me.famiglia_id).single(),
    sb.from('tav_membri').select('user_id, nome, colore, ruolo, condividi_progressi, created_at').eq('famiglia_id', me.famiglia_id).order('created_at'),
  ]);
  S.famiglia = fam;
  S.membri = membri || [];
}

// ---------------------------------------------------------------- accesso
function vistaAccesso(modo = 'entra', messaggio = '') {
  const registrati = modo === 'registrati';
  app.innerHTML = `<main class="accesso">
    <div class="marchio"><img src="icons/logo.svg" alt="" width="104" height="104">
      <p class="marchio-nome">La Grande Famiglia<span>a Tavola</span></p>
      <p class="sotto">Il menu di casa, la spesa e i progressi di tutti, nello stesso posto.</p></div>
    <form id="f-accesso" novalidate>
      ${registrati ? `<label class="campo">Il tuo nome<input type="text" name="nome" autocomplete="given-name" required maxlength="40"></label>` : ''}
      <label class="campo">Email<input type="email" name="email" autocomplete="email" required></label>
      <label class="campo">Password${registrati ? '<small>Almeno 8 caratteri</small>' : ''}<input type="password" name="password" autocomplete="${registrati ? 'new-password' : 'current-password'}" required minlength="${registrati ? 8 : 1}"></label>
      ${registrati ? `<label class="campo">Codice famiglia<small>Te lo dà chi ha creato la famiglia, per esempio LUONI-1A2B3C</small><input type="text" name="codice" autocapitalize="characters" required></label>` : ''}
      <p class="errore" id="err">${esc(messaggio)}</p>
      <button class="btn pieno" type="submit">${registrati ? 'Crea il mio account' : 'Entra'}</button>
    </form>
    <p style="text-align:center;margin-top:16px">${registrati ? 'Hai già un account? <button class="link-btn" id="cambia">Entra</button>' : 'Prima volta qui? <button class="link-btn" id="cambia">Crea il tuo account</button>'}</p>
    ${FIRMA}</main>`;
  document.getElementById('cambia').onclick = () => vistaAccesso(registrati ? 'entra' : 'registrati');
  document.getElementById('f-accesso').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f)), err = document.getElementById('err');
    const btn = f.querySelector('button[type=submit]');
    if (!f.checkValidity()) { err.textContent = 'Completa tutti i campi'; return; }
    btn.disabled = true; err.textContent = '';
    try {
      if (registrati) {
        const r = await chiama('tav-registrati', d);
        if (!r.ok) {
          if (r.dati.esiste) { vistaAccesso('entra', r.dati.errore); return; }
          err.textContent = r.dati.errore || 'Registrazione non riuscita'; btn.disabled = false; return;
        }
      }
      const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.password });
      if (error) { err.textContent = error.message === 'Invalid login credentials' ? 'Email o password non corrette' : error.message; btn.disabled = false; }
    } catch (ex) { err.textContent = 'Connessione assente, riprova'; btn.disabled = false; }
  };
}

function vistaUnisciti() {
  app.innerHTML = `<main class="accesso">
    <div class="marchio"><img src="icons/logo.svg" alt="" width="104" height="104">
      <p class="marchio-nome">Manca solo<span>la famiglia</span></p>
      <p class="sotto">Il tuo account c'è già. Scrivi il codice famiglia per sederti a tavola con gli altri.</p></div>
    <form id="f-unisciti">
      <label class="campo">Il tuo nome<input type="text" name="nome" required maxlength="40"></label>
      <label class="campo">Codice famiglia<input type="text" name="codice" autocapitalize="characters" required></label>
      <p class="errore" id="err"></p>
      <button class="btn pieno">Entra in famiglia</button>
    </form>
    <p style="text-align:center;margin-top:16px"><button class="link-btn" id="esci">Esci</button></p>${FIRMA}</main>`;
  document.getElementById('esci').onclick = () => sb.auth.signOut();
  document.getElementById('f-unisciti').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.rpc('tav_unisciti', { p_codice: d.codice, p_nome: d.nome });
    if (error) { document.getElementById('err').textContent = error.message.includes('non valido') ? 'Codice famiglia non valido' : error.message; return; }
    await caricaMe();
    location.hash = '#/oggi'; mostra();
  };
}

// ---------------------------------------------------------------- OGGI
async function vistaOggi() {
  const g = oggi(), domani = piuGiorni(g, 1);
  const [{ data: pasti }, { data: manca }, { data: pesate }] = await Promise.all([
    sb.from('tav_pasti').select('*').in('giorno', [g, domani]),
    sb.from('tav_spesa').select('*').eq('stato', 'da_comprare').lte('serve_il', piuGiorni(g, 2)).order('serve_il'),
    sb.from('tav_pesate').select('*').eq('user_id', S.me.user_id).order('giorno', { ascending: false }).limit(2),
  ]);
  const diOggi = (pasti || []).filter((p) => p.giorno === g).sort((a, b) => ORDINE_MOMENTO[a.momento] - ORDINE_MOMENTO[b.momento]);
  const diDomani = (pasti || []).filter((p) => p.giorno === domani);
  const cena = diOggi.find((p) => p.momento === 'cena');
  const [piatto, ...resto] = cena ? cena.testo.split(/,\s*poi\s+|;\s*/i) : [];
  const ora = new Date().getHours();
  const quando = ora >= 22 ? 'Stasera si è mangiato' : 'Stasera a cena';

  const ultima = pesate?.[0], prima = pesate?.[1];
  const pesataOggi = ultima?.giorno === g;
  const cenaDomani = diDomani.find((p) => p.momento === 'cena');
  const pranzoDomani = diDomani.find((p) => p.momento === 'pranzo');
  const mancaDomani = (manca || []).filter((m) => m.serve_il === domani);
  const mancaOggi = (manca || []).filter((m) => m.serve_il <= g);

  pagina('oggi', `
    ${testata(maiuscola(dataLunga(g)), `Ciao ${esc(S.me.nome)} · versione ${VERSIONE}`)}
    ${cena ? `<section class="stasera${cena.fatto ? ' fatto' : ''}">
        <p class="quando">${quando}</p>
        <p class="piatto-grande">${esc(piatto)}</p>
        ${resto.length ? `<p class="resto">poi ${esc(resto.join(', '))}</p>` : ''}
        <div class="azioni"><button class="btn" data-fatto="${cena.id}" data-valore="${!cena.fatto}">${cena.fatto ? 'Cena fatta, annulla' : 'Fatto, cena finita'}</button>
        <a class="btn vuoto" href="#/chiedi?q=${encodeURIComponent(`Stasera c'è "${cena.testo}": con cosa posso sostituire qualcosa?`)}">Chiedi una sostituzione</a></div>
      </section>`
    : cenaDomani ? `<section class="stasera"><p class="quando">Domani sera a cena</p><p class="piatto-grande">${esc(cenaDomani.testo.split(/,\s*poi\s+|;\s*/i)[0])}</p>
        <p class="resto">Oggi non c'è niente in programma: il menu riparte domani.</p>
        <div class="azioni"><a class="btn" href="#/settimana">Apri la settimana</a></div></section>`
    : `<section class="stasera"><p class="quando">Stasera a cena</p><p class="piatto-grande">Il menu di oggi è ancora vuoto</p>
        <div class="azioni"><a class="btn" href="#/settimana">Prepara la settimana</a></div></section>`}
    ${mancaOggi.length ? `<div class="blocco zucca" style="margin-top:14px"><b>Per oggi manca ancora:</b> ${mancaOggi.map((m) => esc(m.nome)).join(', ')}. <a href="#/spesa">Apri la spesa</a></div>` : ''}
    <h2>La giornata</h2>
    ${diOggi.length ? tabellaGiorno(diOggi, true) : `<div class="blocco vuoto-stato"><p>Nessun pasto in programma per oggi.</p><a class="btn" href="#/settimana">Apri la settimana</a></div>`}
    <h2>Domani</h2>
    <div class="blocco">
      ${cenaDomani ? `<p style="margin:0 0 6px"><b>Cena:</b> ${esc(cenaDomani.testo)}</p>` : '<p class="tenue">Il menu di domani è ancora vuoto.</p>'}
      ${pranzoDomani ? `<p style="margin:0 0 6px"><b>Pranzo da preparare:</b> ${esc(pranzoDomani.testo)}</p>` : ''}
      ${mancaDomani.length ? `<p style="margin:10px 0 0" class="etichetta-tardi">Per domani ${mancaDomani.length === 1 ? 'manca 1 cosa' : `mancano ${mancaDomani.length} cose`}: <span style="font-weight:400;color:var(--inchiostro)">${mancaDomani.map((m) => esc(m.nome)).join(', ')}</span></p>` : (cenaDomani ? '<p class="tenue piccolo" style="margin:8px 0 0">Per domani c\'è già tutto in casa.</p>' : '')}
    </div>
    ${(manca || []).length ? `<a class="blocco zucca" href="#/spesa" style="display:block;text-decoration:none;color:inherit"><b>Spesa dei prossimi 3 giorni:</b> ${nCose((manca || []).length)} da comprare. <span style="text-decoration:underline">Apri la lista</span></a>` : ''}
    <div class="due">
      <div class="blocco">${ultima ? `<p class="tenue piccolo" style="margin:0">Ultimo peso, ${dataBreve(ultima.giorno)}</p><p class="numero">${num(ultima.peso_kg)}<small>kg</small></p>${prima && ultima.peso_kg && prima.peso_kg ? variazione(ultima.peso_kg - prima.peso_kg, 'dalla volta prima') : ''}` : '<p class="tenue" style="margin:0 0 8px">Non hai ancora registrato il peso.</p>'}
        ${pesataOggi ? '' : '<p style="margin:10px 0 0"><button class="btn piccolo secondario" id="pesati">Registra il peso di oggi</button></p>'}</div>
      <div class="blocco verde"><h3 style="margin-top:0">Hai fatto sport?</h3><p class="piccolo">Segnalo e scopri quanto puoi mangiare in più stasera.</p><a class="btn piccolo" href="#/sport">Registra l'attività</a></div>
    </div>
    ${FIRMA}`);
  collegaTabella(vistaOggi);
  app.querySelectorAll('[data-fatto]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('tav_pasti').update({ fatto: b.dataset.valore === 'true' }).eq('id', b.dataset.fatto);
    if (error) return errore(error);
    vistaOggi();
  });
  const bp = document.getElementById('pesati'); if (bp) bp.onclick = () => nuovaPesata(vistaOggi);
}
function variazione(d, dopo) {
  if (!d) return `<p class="variazione tenue">stabile ${dopo}</p>`;
  return `<p class="variazione ${d < 0 ? 'giu' : 'su'}">${d < 0 ? '−' : '+'}${num(Math.abs(d))} kg ${dopo}</p>`;
}

function tabellaGiorno(pasti, conSpuntini = S.spuntini, giorno = null) {
  const righe = pasti.filter((p) => conSpuntini || !SPUNTINI.has(p.momento))
    .sort((a, b) => ORDINE_MOMENTO[a.momento] - ORDINE_MOMENTO[b.momento]);
  if (!righe.length) return `<table class="tavola"><tbody><tr><td class="vuoto-pasto">Niente in programma${giorno ? ` · <button class="link-btn" data-aggiungi="${giorno}">aggiungi un pasto</button>` : ''}</td></tr></tbody></table>`;
  return `<table class="tavola"><tbody>${righe.map((p) => `
    <tr class="${p.fatto ? 'fatto ' : ''}${SPUNTINI.has(p.momento) ? 'spuntino ' : ''}${p.momento === 'cena' ? 'cena' : ''}">
      <th scope="row">${NOME_MOMENTO[p.momento]}</th>
      <td class="testo-pasto" data-modifica="${p.id}" tabindex="0" role="button" aria-label="Modifica ${NOME_MOMENTO[p.momento]}">${esc(p.testo)}${p.note ? `<br><small class="tenue">${esc(p.note)}</small>` : ''}</td>
      <td class="cella-spunta"><input type="checkbox" class="spunta" data-spunta="${p.id}" ${p.fatto ? 'checked' : ''} aria-label="Fatto: ${NOME_MOMENTO[p.momento]}"></td>
    </tr>`).join('')}</tbody></table>`;
}
function collegaTabella(ridisegna) {
  app.querySelectorAll('[data-spunta]').forEach((c) => c.onchange = async () => {
    c.closest('tr').classList.toggle('fatto', c.checked);
    const { error } = await sb.from('tav_pasti').update({ fatto: c.checked }).eq('id', c.dataset.spunta);
    if (error) errore(error);
  });
  const apri = async (id) => {
    const { data: p } = await sb.from('tav_pasti').select('*').eq('id', id).single();
    if (await modificaPasto(p)) ridisegna();
  };
  app.querySelectorAll('[data-modifica]').forEach((t) => {
    t.onclick = () => apri(t.dataset.modifica);
    t.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri(t.dataset.modifica); } };
  });
  app.querySelectorAll('[data-aggiungi]').forEach((b) => b.onclick = async () => { if (await modificaPasto({ giorno: b.dataset.aggiungi, momento: 'cena', testo: '' })) ridisegna(); });
}
const rigaIngrediente = (i) => [i.nome, i.quantita].filter(Boolean).join(' ');
function leggiIngredienti(testo) {
  return testo.split('\n').map((r) => r.trim()).filter(Boolean).map((r, k) => {
    const m = r.match(/^(.*?)[\s,:–-]+((?:\d|½|¼|¾|mezz|un |una |q\.b).*)$/i);
    return m && m[1].trim() ? { nome: m[1].trim(), quantita: m[2].trim(), ordine: k + 1 } : { nome: r, quantita: null, ordine: k + 1 };
  });
}

async function modificaPasto(p) {
  const nuovo = !p.id;
  let ingredienti = [];
  if (!nuovo) ({ data: ingredienti } = await sb.from('tav_ingredienti').select('*').eq('pasto_id', p.id).order('ordine'));
  const r = await finestra(`
    <h2>${nuovo ? 'Aggiungi un pasto' : `${NOME_MOMENTO[p.momento]} di ${dataMedia(p.giorno)}`}</h2>
    <div class="riga-campi">
      <label class="campo">Giorno<input type="date" name="giorno" value="${p.giorno}" required></label>
      <label class="campo">Momento<select name="momento">${MOMENTI.map(([k, t]) => `<option value="${k}"${k === p.momento ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <label class="campo">Cosa si mangia<textarea name="testo" required maxlength="400">${esc(p.testo)}</textarea></label>
    <label class="campo">Ingredienti <small>uno per riga, con la quantità per tutti, per esempio "zucca 500 g"</small><textarea name="ingredienti" rows="5" maxlength="1500">${esc((ingredienti || []).map(rigaIngrediente).join('\n'))}</textarea></label>
    <label class="campo">Nota <small>facoltativa: porzioni, chi lo prepara, cosa scongelare</small><input type="text" name="note" value="${esc(p.note || '')}" maxlength="200"></label>
    <div class="azioni">${nuovo ? '' : '<button class="btn elimina" value="elimina" formnovalidate>Elimina</button>'}
      <button class="btn secondario" value="annulla" formnovalidate>Annulla</button><button class="btn" value="salva">Salva</button></div>`);
  if (!r) return false;
  if (r.azione === 'elimina') {
    const { error } = await sb.from('tav_pasti').delete().eq('id', p.id);
    if (error) { errore(error); return false; }
    avviso('Pasto eliminato'); return true;
  }
  const dati = { giorno: r.giorno, momento: r.momento, testo: r.testo.trim(), note: r.note.trim() || null };
  const res = nuovo
    ? await sb.from('tav_pasti').insert({ ...dati, famiglia_id: S.me.famiglia_id, created_by: S.me.user_id }).select().single()
    : await sb.from('tav_pasti').update(dati).eq('id', p.id);
  if (res.error) { errore(res.error); return false; }
  const pastoId = nuovo ? res.data.id : p.id;
  const prima = (ingredienti || []).map(rigaIngrediente).join('\n');
  if (r.ingredienti.trim() !== prima.trim()) {
    if (!nuovo) await sb.from('tav_ingredienti').delete().eq('pasto_id', pastoId);
    const nuovi = leggiIngredienti(r.ingredienti).map((i) => ({ ...i, pasto_id: pastoId, famiglia_id: S.me.famiglia_id }));
    if (nuovi.length) { const { error } = await sb.from('tav_ingredienti').insert(nuovi); if (error) { errore(error); return false; } }
  }
  avviso(nuovo ? 'Pasto aggiunto' : 'Pasto salvato');
  return true;
}

// ---------------------------------------------------------------- SETTIMANA
async function vistaSettimana() {
  // la domenica il menu che conta è quello della settimana che parte domani
  if (!S.lunedi) S.lunedi = daYmd(oggi()).getDay() === 0 ? piuGiorni(oggi(), 1) : lunediDi(oggi());
  const lun = S.lunedi, dom = piuGiorni(lun, 6);
  const { data: pasti, error } = await sb.from('tav_pasti').select('*').gte('giorno', lun).lte('giorno', dom);
  if (error) return errore(error);
  const titoloSett = lun === lunediDi(oggi()) ? 'Questa settimana' : lun === piuGiorni(lunediDi(oggi()), 7) ? 'Settimana prossima' : lun === piuGiorni(lunediDi(oggi()), -7) ? 'Settimana scorsa' : `Settimana del ${daYmd(lun).getDate()} ${MESI[daYmd(lun).getMonth()]}`;
  const giorni = [...Array(7)].map((_, i) => piuGiorni(lun, i));
  const vuota = !pasti?.length;
  pagina('settimana', `
    ${testata('Il menu', 'La settimana di tutti')}
    <div class="navigatore"><button class="icona-btn" id="prec" aria-label="Settimana precedente">${ICONE.indietro}</button>
      <strong>${titoloSett}<br><span class="tenue piccolo" style="font-family:var(--testo);font-weight:400">${daYmd(lun).getDate()} – ${daYmd(dom).getDate()} ${MESI[daYmd(dom).getMonth()]}</span></strong>
      <button class="icona-btn" id="succ" aria-label="Settimana successiva">${ICONE.avanti}</button></div>
    <div class="azioni" style="justify-content:space-between;margin-bottom:16px">
      <label class="interruttore"><input type="checkbox" id="spuntini" ${S.spuntini ? 'checked' : ''}> Mostra gli spuntini</label>
      <button class="btn piccolo secondario" id="nuovo">Aggiungi un pasto</button></div>
    ${vuota ? `<div class="blocco vuoto-stato"><h3>Questa settimana è ancora da scrivere</h3><p>Parti dalla settimana tipo del piano o copia quella precedente, poi cambia quello che vuoi.</p>
        <div class="azioni" style="justify-content:center"><button class="btn" id="tipo">Carica la settimana tipo</button><button class="btn secondario" id="copia">Copia la settimana precedente</button></div></div>`
    : giorni.map((g) => `<section class="giorno"><div class="giorno-testa${g === oggi() ? ' oggi' : ''}"><h3>${maiuscola(dataMedia(g))}</h3><button class="link-btn piccolo" data-aggiungi="${g}">Aggiungi</button></div>
        ${tabellaGiorno((pasti || []).filter((p) => p.giorno === g), S.spuntini, g)}</section>`).join('')}
    ${vuota ? '' : '<p class="tenue piccolo" style="text-align:center">Tocca un piatto per cambiarlo. La spunta segna che è stato mangiato.</p>'}
    ${FIRMA}`);
  document.getElementById('prec').onclick = () => { S.lunedi = piuGiorni(S.lunedi, -7); vistaSettimana(); };
  document.getElementById('succ').onclick = () => { S.lunedi = piuGiorni(S.lunedi, 7); vistaSettimana(); };
  document.getElementById('spuntini').onchange = (e) => { S.spuntini = e.target.checked; vistaSettimana(); };
  document.getElementById('nuovo').onclick = async () => { if (await modificaPasto({ giorno: lun <= oggi() && oggi() <= dom ? oggi() : lun, momento: 'cena', testo: '' })) vistaSettimana(); };
  const bt = document.getElementById('tipo');
  if (bt) bt.onclick = async () => {
    bt.disabled = true;
    const { error: e } = await sb.rpc('tav_carica_piano_base', { p_lunedi: lun });
    if (e) return errore(e);
    avviso('Settimana tipo caricata'); vistaSettimana();
  };
  const bc = document.getElementById('copia');
  if (bc) bc.onclick = async () => {
    const { data: prima } = await sb.from('tav_pasti').select('id, giorno, momento, testo, note').gte('giorno', piuGiorni(lun, -7)).lte('giorno', piuGiorni(lun, -1));
    if (!prima?.length) { avviso('Anche la settimana precedente è vuota'); return; }
    const righe = prima.map(({ id, ...p }) => ({ ...p, giorno: piuGiorni(p.giorno, 7), famiglia_id: S.me.famiglia_id, created_by: S.me.user_id }));
    const { data: nuovi, error: e } = await sb.from('tav_pasti').insert(righe).select();
    if (e) return errore(e);
    // anche gli ingredienti, pasto per pasto
    const { data: ingr } = await sb.from('tav_ingredienti').select('pasto_id, nome, quantita, ordine').in('pasto_id', prima.map((p) => p.id));
    const mappa = new Map(prima.map((p, k) => [p.id, nuovi?.[k]?.id]));
    const copia = (ingr || []).filter((i) => mappa.get(i.pasto_id)).map((i) => ({ ...i, pasto_id: mappa.get(i.pasto_id), famiglia_id: S.me.famiglia_id }));
    if (copia.length) await sb.from('tav_ingredienti').insert(copia);
    avviso('Settimana copiata'); vistaSettimana();
  };
  collegaTabella(vistaSettimana);
}

// ---------------------------------------------------------------- SPESA
// Una lista sola: quello che c'è da comprare. Si spunta quando è nel carrello.
// In alto si scelgono i giorni (per esempio lunedì e martedì) e la lista mostra solo quello che serve per quei giorni.
function giorniSpesa() { return [...Array(7)].map((_, i) => piuGiorni(oggi(), i)); }

async function vistaSpesa() {
  const giorni = giorniSpesa();
  const scelti = S.giorniSpesa || (S.giorniSpesa = new Set());
  for (const g of [...scelti]) if (!giorni.includes(g)) scelti.delete(g);
  const { data: cose, error } = await sb.from('tav_spesa').select('*').order('nome');
  if (error) return errore(error);
  const daComprare = (cose || []).filter((c) => c.stato === 'da_comprare');
  const chip = (val, testo, attivo) => `<button class="giorno-chip${val === 'lista' ? ' lista' : ''}" data-giorno="${val}" aria-pressed="${attivo}">${testo}</button>`;
  const testa = `
    ${testata('La spesa', scelti.size ? 'Cosa serve nei giorni scelti' : (daComprare.length ? `${nCose(daComprare.length)} da comprare` : 'Niente da comprare'))}
    <div class="giorni-spesa" role="group" aria-label="Cosa vuoi vedere">
      ${chip('lista', `Lista della spesa${daComprare.length ? ` <small>${daComprare.length}</small>` : ''}`, !scelti.size)}
      ${giorni.map((g, i) => chip(g, i === 0 ? 'Oggi' : i === 1 ? 'Domani' : maiuscola(dataBreve(g)), scelti.has(g))).join('')}
    </div>`;
  if (scelti.size) return vistaSpesaGiorni(testa, [...scelti].sort(), cose || []);

  const inCasa = (cose || []).filter((c) => c.stato !== 'da_comprare' && !S.spuntatiOra?.has(c.id));
  const presiOra = (cose || []).filter((c) => c.stato !== 'da_comprare' && S.spuntatiOra?.has(c.id));
  // raggruppata per giorno in cui serve (la più urgente in alto), dentro ogni giorno per reparto
  const chiaveGiorno = (c) => (!c.serve_il ? 'zzz' : c.serve_il < oggi() ? oggi() : c.serve_il);
  const titoloGiorno = (k) => (k === 'zzz' ? 'Senza un giorno preciso' : k === oggi() ? 'Per oggi' : k === piuGiorni(oggi(), 1) ? 'Per domani' : `Per ${dataMedia(k)}`);
  const ordinaReparto = (a, b) => REPARTI.indexOf(a.reparto) - REPARTI.indexOf(b.reparto) || a.nome.localeCompare(b.nome);
  const perReparto = [...new Set(daComprare.map(chiaveGiorno))].sort().map((k) => [titoloGiorno(k), daComprare.filter((c) => chiaveGiorno(c) === k).sort(ordinaReparto)]);
  pagina('spesa', `${testa}
    <p class="aiuto">Spunta quello che metti nel carrello. Per sapere cosa manca per un giorno, tocca il giorno qui sopra.</p>
    ${daComprare.length || presiOra.length ? `<ul class="lista-spesa grande">
      ${perReparto.map(([r, l]) => `<li class="reparto-riga">${r}</li>${l.map(rigaCosa).join('')}`).join('')}
      ${presiOra.map(rigaCosa).join('')}
    </ul>` : `<div class="blocco vuoto-stato"><h3>Niente da comprare</h3><p>Tocca un giorno qui sopra per controllare cosa serve, oppure aggiungi qui sotto quello che manca.</p></div>`}
    <form class="blocco" id="f-agg" style="margin-top:16px">
      <h3>Aggiungi alla lista</h3>
      <div class="aggiungi"><input type="text" name="nome" placeholder="Cosa, per esempio latte di soia" aria-label="Cosa comprare" required maxlength="80"><input type="text" name="quantita" placeholder="Quanto" aria-label="Quantità" maxlength="30"></div>
      <div class="riga"><label class="campo cresci" style="margin:0">Serve per<select name="serve_il"><option value="">Nessun giorno preciso</option>${giorni.map((g, i) => `<option value="${g}">${i === 0 ? 'Oggi' : i === 1 ? 'Domani' : maiuscola(dataMedia(g))}</option>`).join('')}</select></label>
      <button class="btn" style="align-self:flex-end">Aggiungi</button></div>
    </form>
    ${inCasa.length ? `<details class="blocco già-comprato"><summary><b>Già comprato</b> <span class="tenue">(${inCasa.length})</span></summary>
      <p class="tenue piccolo">Se una cosa è finita, toccala per rimetterla nella lista.</p>
      <div class="azioni">${inCasa.sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => `<button class="pillola" data-rimetti="${c.id}">${esc(c.nome)}</button>`).join('')}</div></details>` : ''}
    ${FIRMA}`);
  collegaChip();
  app.querySelectorAll('[data-preso]').forEach((c) => c.onchange = async () => {
    const li = c.closest('li'); li.classList.toggle('preso', c.checked);
    (S.spuntatiOra ||= new Set()).add(c.dataset.preso);
    const { error: er } = await sb.from('tav_spesa').update({ stato: c.checked ? 'in_casa' : 'da_comprare' }).eq('id', c.dataset.preso);
    if (er) { errore(er); c.checked = !c.checked; li.classList.toggle('preso', c.checked); return; }
    const titolo = app.querySelector('.testata small');
    const restano = app.querySelectorAll('[data-preso]:not(:checked)').length;
    if (titolo) titolo.textContent = restano ? `${nCose(restano)} da comprare` : 'Tutto preso!';
  });
  app.querySelectorAll('[data-cosa]').forEach((n) => {
    const apri = async () => { if (await modificaCosa((cose || []).find((x) => x.id === n.dataset.cosa))) vistaSpesa(); };
    n.onclick = apri; n.onkeydown = (e) => { if (e.key === 'Enter') apri(); };
  });
  app.querySelectorAll('[data-rimetti]').forEach((b) => b.onclick = async () => {
    const { error: er } = await sb.from('tav_spesa').update({ stato: 'da_comprare' }).eq('id', b.dataset.rimetti);
    if (er) return errore(er);
    avviso(`${b.textContent} di nuovo in lista`); vistaSpesa();
  });
  document.getElementById('f-agg').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const nome = d.nome.trim(); if (!nome) return;
    const { error: er } = await sb.from('tav_spesa').insert({ famiglia_id: S.me.famiglia_id, created_by: S.me.user_id, nome, quantita: d.quantita.trim() || null, reparto: indovinaReparto(nome), serve_il: d.serve_il || null });
    if (er) return errore(er);
    avviso(`${nome} in lista`); vistaSpesa();
  };
}

function collegaChip() {
  app.querySelectorAll('[data-giorno]').forEach((b) => b.onclick = () => {
    const v = b.dataset.giorno, scelti = S.giorniSpesa;
    if (v === 'lista') scelti.clear(); else if (scelti.has(v)) scelti.delete(v); else scelti.add(v);
    S.spuntatiOra = new Set();
    vistaSpesa();
  });
}

// Giorni scelti: gli ingredienti dei pasti di quei giorni. "Manca" li manda nella lista della spesa.
async function vistaSpesaGiorni(testa, scelti, cose) {
  const { data: pasti } = await sb.from('tav_pasti').select('id, giorno, momento, testo').in('giorno', scelti);
  const ids = (pasti || []).map((p) => p.id);
  const { data: ingr } = ids.length ? await sb.from('tav_ingredienti').select('*').in('pasto_id', ids).order('ordine') : { data: [] };
  const legato = new Map((cose || []).filter((c) => c.ingrediente_id).map((c) => [c.ingrediente_id, c]));
  const stato = (i) => { const c = legato.get(i.id); return !c ? 'casa' : c.stato === 'da_comprare' ? 'lista' : 'preso'; };
  const bottone = (i) => {
    const st = stato(i);
    if (st === 'preso') return `<span class="stato-ingr preso">Comprato</span>`;
    return `<button class="manca${st === 'lista' ? ' attivo' : ''}" data-ingr="${i.id}" aria-pressed="${st === 'lista'}">${st === 'lista' ? 'In lista' : 'Manca'}</button>`;
  };
  const daComprareQui = (ingr || []).filter((i) => stato(i) === 'lista').length;
  const blocchi = scelti.map((g) => {
    const delGiorno = (pasti || []).filter((p) => p.giorno === g).sort((a, b) => ORDINE_MOMENTO[a.momento] - ORDINE_MOMENTO[b.momento]);
    if (!delGiorno.length) return `<section class="giorno"><div class="giorno-testa"><h3>${maiuscola(dataMedia(g))}</h3></div><p class="tenue">Il menu di questo giorno è vuoto.</p></section>`;
    return `<section class="giorno"><div class="giorno-testa${g === oggi() ? ' oggi' : ''}"><h3>${maiuscola(dataMedia(g))}</h3></div>
      <ul class="lista-spesa ingredienti">${delGiorno.map((p) => {
        const suoi = (ingr || []).filter((i) => i.pasto_id === p.id);
        return `<li class="reparto-riga"><span>${NOME_MOMENTO[p.momento]}</span><small>${esc(p.testo)}</small></li>${suoi.length
          ? suoi.map((i) => `<li><span class="nome"><b>${esc(i.nome)}</b>${i.quantita ? `<small>${esc(i.quantita)}</small>` : ''}</span>${bottone(i)}</li>`).join('')
          : `<li class="tenue piccolo"><span>Nessun ingrediente scritto. <button class="link-btn" data-pasto="${p.id}">Aggiungili</button></span></li>`}`;
      }).join('')}</ul></section>`;
  }).join('');
  pagina('spesa', `${testa}
    <p class="aiuto">Ecco cosa serve per ${scelti.length === 1 ? 'questo giorno' : 'questi giorni'}. Se una cosa non ce l'hai, tocca <b>Manca</b>: finisce nella lista della spesa.</p>
    ${blocchi}
    <p class="azioni" style="justify-content:center;margin-top:8px"><button class="btn" data-giorno="lista">Vai alla lista della spesa${daComprareQui ? ` (${daComprareQui} da qui)` : ''}</button></p>
    ${FIRMA}`);
  collegaChip();
  app.querySelectorAll('[data-ingr]').forEach((b) => b.onclick = async () => {
    const i = (ingr || []).find((x) => x.id === b.dataset.ingr);
    const c = legato.get(i.id);
    const p = (pasti || []).find((x) => x.id === i.pasto_id);
    b.disabled = true;
    if (c && c.stato === 'da_comprare') {
      const { error } = await sb.from('tav_spesa').delete().eq('id', c.id);
      if (error) { b.disabled = false; return errore(error); }
      legato.delete(i.id);
      b.classList.remove('attivo'); b.textContent = 'Manca'; b.setAttribute('aria-pressed', 'false');
    } else {
      const { data, error } = await sb.from('tav_spesa').insert({ famiglia_id: S.me.famiglia_id, created_by: S.me.user_id, nome: i.nome, quantita: i.quantita, reparto: indovinaReparto(i.nome), serve_il: p.giorno, ingrediente_id: i.id }).select().single();
      if (error) { b.disabled = false; return errore(error); }
      legato.set(i.id, data);
      b.classList.add('attivo'); b.textContent = 'In lista'; b.setAttribute('aria-pressed', 'true');
    }
    b.disabled = false;
    const n = app.querySelectorAll('.manca.attivo').length;
    const vai = app.querySelector('.azioni [data-giorno="lista"]');
    if (vai) vai.textContent = `Vai alla lista della spesa${n ? ` (${n} da qui)` : ''}`;
  });
  app.querySelectorAll('[data-pasto]').forEach((b) => b.onclick = async () => {
    const { data: p } = await sb.from('tav_pasti').select('*').eq('id', b.dataset.pasto).single();
    if (await modificaPasto(p)) vistaSpesa();
  });
}

function rigaCosa(c) {
  const preso = c.stato !== 'da_comprare';
  const dettagli = [c.quantita, c.reparto !== 'Altro' && c.reparto].filter(Boolean).join(' · ');
  return `<li class="${preso ? 'preso' : ''}">
    <input type="checkbox" class="spunta" data-preso="${c.id}" ${preso ? 'checked' : ''} aria-label="Comprato: ${esc(c.nome)}">
    <span class="nome" data-cosa="${c.id}" role="button" tabindex="0"><b>${esc(c.nome)}</b>${dettagli ? `<small>${esc(dettagli)}</small>` : ''}</span></li>`;
}

async function modificaCosa(c) {
  const r = await finestra(`
    <h2>${esc(c.nome)}</h2>
    <label class="campo">Cosa<input type="text" name="nome" value="${esc(c.nome)}" required maxlength="80"></label>
    <div class="riga-campi">
      <label class="campo">Quanto<input type="text" name="quantita" value="${esc(c.quantita || '')}" maxlength="30"></label>
      <label class="campo">Serve per il<input type="date" name="serve_il" value="${c.serve_il || ''}"></label>
    </div>
    <label class="campo">Reparto<select name="reparto">${REPARTI.map((r) => `<option${r === c.reparto ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <div class="azioni"><button class="btn elimina" value="elimina" formnovalidate>Togli dalla lista</button><button class="btn secondario" value="annulla" formnovalidate>Annulla</button><button class="btn" value="salva">Salva</button></div>`);
  if (!r) return false;
  const q = r.azione === 'elimina'
    ? sb.from('tav_spesa').delete().eq('id', c.id)
    : sb.from('tav_spesa').update({ nome: r.nome.trim(), quantita: r.quantita.trim() || null, reparto: r.reparto, serve_il: r.serve_il || null }).eq('id', c.id);
  const { error } = await q;
  if (error) { errore(error); return false; }
  return true;
}

// ---------------------------------------------------------------- CHIEDI
const SUGGERIMENTI = [
  'Posso sostituire le pere con le banane?',
  'Quanto pane posso mangiare a cena?',
  'Ho fatto 60 km in bici: quanto mangio in più stasera?',
  'Ho fame dopo cena, cosa posso mangiare?',
  'Che spuntino porto al lavoro che non lasci odore?',
  'Questi cereali con 14 g di zucchero vanno bene?',
];
async function vistaChiedi(param = {}) {
  const { data: storia } = await sb.from('tav_chat').select('ruolo, testo, created_at').eq('user_id', S.me.user_id).order('created_at', { ascending: false }).limit(30);
  const messaggi = (storia || []).reverse();
  pagina('chiedi', `
    ${testata('Chiedi a Claude', 'Cibo, spesa e benessere')}
    ${S.chatNonAttiva ? cartaNonAttiva() : ''}
    ${messaggi.length ? '' : `<div class="blocco verde"><p style="margin:0">Chiedi se puoi sostituire un alimento, quanto mangiarne, cosa portare al lavoro o quanto mangiare dopo lo sport. Claude conosce il menu di famiglia, le tue preferenze e i tuoi progressi. Parla solo di alimentazione, spesa e benessere.</p></div>`}
    <div class="chat" id="chat">${messaggi.map(bolla).join('')}</div>
    <div class="suggerimenti">${SUGGERIMENTI.slice(0, messaggi.length ? 3 : 6).map((s) => `<button data-sugg="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <form class="scrivi" id="f-chiedi"><textarea name="domanda" rows="1" placeholder="${Riconoscimento ? 'Scrivi o tocca il microfono' : 'Scrivi la tua domanda'}" aria-label="La tua domanda" required maxlength="2000">${esc(param.q || '')}</textarea>${Riconoscimento ? `<button type="button" class="btn vuoto mic" id="mic" aria-label="Parla">${ICONE.microfono}</button>` : ''}<button class="btn" id="invia" aria-label="Invia">${ICONE.invia}</button></form>
    <p class="voce-stato" id="voce-stato" hidden></p>
    ${messaggi.length ? '<p style="text-align:center"><button class="link-btn piccolo" id="pulisci">Cancella la conversazione</button></p>' : ''}
    ${FIRMA}`);
  const f = document.getElementById('f-chiedi'), ta = f.querySelector('textarea'), chat = document.getElementById('chat');
  const adatta = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
  ta.oninput = adatta; adatta();
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); f.requestSubmit(); } };
  if (messaggi.length) chat.lastElementChild?.scrollIntoView({ block: 'end' });
  app.querySelectorAll('[data-sugg]').forEach((b) => b.onclick = () => { ta.value = b.dataset.sugg; adatta(); f.requestSubmit(); });
  const pl = document.getElementById('pulisci');
  if (pl) pl.onclick = async () => { if (await conferma('Cancellare tutta la conversazione?', 'Cancella')) { await sb.from('tav_chat').delete().eq('user_id', S.me.user_id); vistaChiedi(); } };
  collegaAscolta(chat);
  let aVoce = false;
  const mic = document.getElementById('mic'), stato = document.getElementById('voce-stato');
  if (mic) {
    let rec = null;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      zitto();
      rec = new Riconoscimento(); rec.lang = 'it-IT'; rec.interimResults = true; rec.continuous = false;
      const prima = ta.value.trim();
      mic.classList.add('ascolta'); stato.hidden = false; stato.textContent = 'Ti ascolto… parla pure';
      rec.onresult = (ev) => { const t = Array.from(ev.results).map((r) => r[0].transcript).join(''); ta.value = (prima ? prima + ' ' : '') + t; adatta(); };
      rec.onerror = (ev) => { stato.textContent = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Il microfono è bloccato: consentilo nelle impostazioni del browser per questo sito.' : ev.error === 'no-speech' ? 'Non ho sentito niente, riprova.' : 'Non riesco ad ascoltare adesso, riprova.'; };
      rec.onend = () => {
        mic.classList.remove('ascolta'); rec = null;
        if (ta.value.trim() && ta.value.trim() !== prima) { stato.hidden = true; aVoce = true; f.requestSubmit(); }
        else if (stato.textContent === 'Ti ascolto… parla pure') stato.hidden = true;
      };
      try { rec.start(); } catch { mic.classList.remove('ascolta'); rec = null; }
    };
  }
  f.onsubmit = async (e) => {
    e.preventDefault();
    const leggi = aVoce; aVoce = false;
    const domanda = ta.value.trim(); if (!domanda) return;
    ta.value = ''; adatta();
    chat.insertAdjacentHTML('beforeend', bolla({ ruolo: 'user', testo: domanda }) + '<div class="msg assistant attesa" id="attesa">Claude ci sta pensando…</div>');
    document.getElementById('attesa').scrollIntoView({ block: 'end', behavior: 'smooth' });
    const btn = document.getElementById('invia'); btn.disabled = true;
    const r = await chiama('tav-chiedi', { domanda });
    document.getElementById('attesa')?.remove(); btn.disabled = false;
    if (r.status === 503 && r.dati.errore === 'non_attivo') { S.chatNonAttiva = true; chat.lastElementChild?.remove(); ta.value = domanda; vistaChiedi({ q: domanda }); return; }
    if (!r.ok) { chat.insertAdjacentHTML('beforeend', `<div class="msg assistant"><span class="chi">Avviso</span>${esc(r.dati.errore || 'Non riesco a rispondere adesso, riprova tra poco.')}</div>`); return; }
    chat.insertAdjacentHTML('beforeend', bolla({ ruolo: 'assistant', testo: r.dati.risposta }));
    chat.lastElementChild.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (leggi) chat.lastElementChild.querySelector('.ascolta-btn')?.click();
  };
}
// Voce: dettatura e lettura ad alta voce, gratis, fatte dal telefono (Web Speech API).
const Riconoscimento = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const puoParlare = 'speechSynthesis' in window;
function zitto() { if (puoParlare) speechSynthesis.cancel(); document.querySelectorAll('.ascolta-btn.attivo').forEach((b) => { b.classList.remove('attivo'); b.lastChild.textContent = 'Ascolta'; }); }
function vocePerItaliano() { const v = speechSynthesis.getVoices().filter((x) => x.lang?.toLowerCase().startsWith('it')); return v.find((x) => /premium|enhanced|natural|google/i.test(x.name)) || v[0] || null; }
function collegaAscolta(chat) {
  if (!puoParlare) return;
  speechSynthesis.getVoices();
  chat.onclick = (e) => {
    const b = e.target.closest('.ascolta-btn'); if (!b) return;
    if (b.classList.contains('attivo')) { zitto(); return; }
    zitto();
    const testo = b.closest('.msg').querySelector('.testo').textContent.replace(/[•*#]/g, ' ').replace(/\s+/g, ' ').trim();
    const u = new SpeechSynthesisUtterance(testo); u.lang = 'it-IT'; const v = vocePerItaliano(); if (v) u.voice = v; u.rate = 1.02;
    u.onend = u.onerror = () => { b.classList.remove('attivo'); b.lastChild.textContent = 'Ascolta'; };
    b.classList.add('attivo'); b.lastChild.textContent = 'Ferma';
    speechSynthesis.speak(u);
  };
}
function bolla(m) {
  const testo = esc(m.testo).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return m.ruolo === 'user' ? `<div class="msg user">${testo}</div>` : `<div class="msg assistant"><span class="chi"><img src="icons/logo.svg" alt="" width="16" height="16">Claude${puoParlare ? `<button type="button" class="ascolta-btn" aria-label="Ascolta la risposta">${ICONE.altoparlante}<span>Ascolta</span></button>` : ''}</span><span class="testo">${testo}</span></div>`;
}
function cartaNonAttiva() {
  return `<div class="blocco zucca"><h3>Chiedi a Claude non è ancora attivo</h3>
    <p>È l'unica parte a pagamento del sito: ogni risposta costa circa un centesimo di euro, pagato con una chiave API Anthropic. ${S.me.ruolo === 'admin' ? 'Per attivarlo segui i passi nella <a href="#/guida">guida</a>, alla voce "Attivare Chiedi a Claude".' : 'Chiedi a chi ha creato la famiglia di attivarlo.'}</p></div>`;
}

// ---------------------------------------------------------------- IO
async function vistaIo() {
  const { data: pesate } = await sb.from('tav_pesate').select('*').eq('user_id', S.me.user_id).order('giorno').order('created_at');
  // una misura per giorno: se ti sei pesato due volte vale l'ultima
  const p = [...new Map((pesate || []).map((x) => [x.giorno, x])).values()];
  // il confronto parte dalla prima misura degli ultimi 90 giorni (l'inizio del percorso attuale)
  const recenti = p.filter((x) => x.giorno >= piuGiorni(oggi(), -90));
  const ultima = p[p.length - 1], primaP = recenti[0] || p[0];
  const me = S.me;
  const icsHttps = `${SUPABASE_URL}/functions/v1/tav-calendario?t=${me.ics_token}`;
  const icsWebcal = icsHttps.replace(/^https:/, 'webcal:');
  const mancano = ultima?.peso_kg && me.obiettivo_kg ? ultima.peso_kg - me.obiettivo_kg : null;
  pagina('io', `
    ${testata(esc(me.nome), 'Il mio spazio')}
    <div class="due quattro">
      <div class="blocco"><p class="tenue piccolo" style="margin:0">Peso</p><p class="numero">${num(ultima?.peso_kg)}<small>kg</small></p>
        ${ultima && primaP && ultima !== primaP ? variazione(ultima.peso_kg - primaP.peso_kg, `dal ${daYmd(primaP.giorno).getDate()} ${MESI[daYmd(primaP.giorno).getMonth()]}`) : ''}
        ${mancano != null ? `<p class="tenue piccolo" style="margin:0">${mancano > 0 ? `Mancano ${num(mancano)} kg all'obiettivo di ${num(me.obiettivo_kg)}` : 'Obiettivo raggiunto!'}</p>` : ''}</div>
      ${cartaValore(p, 'grasso_pct', 'Grasso', '%', true)}
      ${cartaValore(p, 'muscoli_kg', 'Massa muscolare', 'kg', false)}
      ${cartaValore(p, 'viscerale', 'Grasso viscerale', '', true, 'Sotto 10 va bene')}
    </div>
    ${letturaComposizione(p)}
    <p class="azioni"><button class="btn" id="pesati">Registra peso e misure</button><a class="btn secondario" href="#/sport">Sport e attività</a></p>
    ${p.filter((x) => x.peso_kg).length >= 2 ? `<h2>Andamento del peso</h2><div class="blocco">${graficoPeso(p.filter((x) => x.peso_kg), me.obiettivo_kg)}</div>` : ''}
    ${p.length ? `<h2>Ultime misure</h2><ul class="lista-spesa">${p.slice(-8).reverse().map((x) => `<li><span class="nome" data-pesata="${x.id}" role="button" tabindex="0"><b>${maiuscola(dataConMese(x.giorno))}</b><small>${[x.peso_kg && `${num(x.peso_kg)} kg`, x.grasso_pct && `grasso ${num(x.grasso_pct)}%`, x.muscoli_kg && `muscoli ${num(x.muscoli_kg, 2)} kg`, x.viscerale && `viscerale ${num(x.viscerale)}`, x.acqua_pct && `acqua ${num(x.acqua_pct)}%`].filter(Boolean).join(' · ')}</small></span></li>`).join('')}</ul>` : ''}

    <h2>Promemoria sul telefono</h2>
    <div class="blocco verde">
      <p>Iscrivi il calendario del telefono: ogni mattina alle 7 ti arriva cosa si mangia oggi, ogni sera alle 20:30 cosa si mangia domani e cosa manca da comprare.</p>
      <p class="azioni"><a class="btn" href="${icsWebcal}">Aggiungi al calendario</a><button class="btn secondario" id="copia-ics">Copia il link</button></p>
      <p class="tenue piccolo" style="margin:0">Su Android, se il tasto non funziona: Google Calendar dal computer › Altri calendari › Da URL e incolla il link. Il link è personale: non condividerlo. <button class="link-btn piccolo" id="rinnova">Rinnova il link</button></p>
    </div>

    <h2>Profilo e preferenze</h2>
    <form class="blocco" id="f-profilo">
      <label class="campo">Nome<input type="text" name="nome" value="${esc(me.nome)}" required maxlength="40"></label>
      <div class="riga-campi">
        <label class="campo">Altezza (cm)<input type="number" name="altezza_cm" value="${me.altezza_cm ?? ''}" min="50" max="230" step="1" inputmode="numeric"></label>
        <label class="campo">Anno di nascita<input type="number" name="anno_nascita" value="${me.anno_nascita ?? ''}" min="1920" max="2026" inputmode="numeric"></label>
      </div>
      <div class="riga-campi">
        <label class="campo">Obiettivo (kg)<input type="number" name="obiettivo_kg" value="${me.obiettivo_kg ?? ''}" min="20" max="250" step="0.1" inputmode="decimal"></label>
        <label class="campo">Calorie al giorno<input type="number" name="kcal_giorno" value="${me.kcal_giorno ?? ''}" min="800" max="5000" step="50" inputmode="numeric"></label>
      </div>
      <label class="campo">Preferenze e cose da evitare<small>Claude ne tiene conto quando risponde</small><textarea name="preferenze" maxlength="800">${esc(me.preferenze || '')}</textarea></label>
      <fieldset style="border:0;padding:0;margin:0 0 14px"><legend style="font-weight:700;font-size:15px;margin-bottom:6px">Il tuo colore</legend>
        <div class="azioni">${COLORI.map((c) => `<label style="cursor:pointer"><input type="radio" name="colore" value="${c}" ${c === me.colore ? 'checked' : ''} style="position:absolute;opacity:0"><span class="pallino" style="background:${c};${c === me.colore ? 'box-shadow:0 0 0 3px var(--carta),0 0 0 5px ' + c : ''}">${c === me.colore ? '✓' : ''}</span></label>`).join('')}</div></fieldset>
      <label class="interruttore" style="margin-bottom:16px"><input type="checkbox" name="condividi_progressi" ${me.condividi_progressi ? 'checked' : ''}> Mostra i miei progressi alla famiglia</label>
      <button class="btn">Salva il profilo</button>
    </form>
    <p class="azioni" style="justify-content:center"><a class="btn secondario" href="#/famiglia">La famiglia</a><a class="btn secondario" href="#/guida">Guida</a><button class="btn vuoto" id="esci">Esci</button></p>
    ${FIRMA}`);
  document.getElementById('pesati').onclick = () => nuovaPesata(vistaIo);
  document.getElementById('esci').onclick = () => sb.auth.signOut();
  document.getElementById('copia-ics').onclick = async () => { try { await navigator.clipboard.writeText(icsHttps); avviso('Link copiato'); } catch { prompt('Copia il link', icsHttps); } };
  document.getElementById('rinnova').onclick = async () => {
    if (!(await conferma('Rinnovare il link? Quello vecchio smette di funzionare e dovrai iscrivere di nuovo il calendario.', 'Rinnova'))) return;
    const { error } = await sb.rpc('tav_nuovo_token_calendario'); if (error) return errore(error);
    await caricaMe(); avviso('Link rinnovato'); vistaIo();
  };
  app.querySelectorAll('input[name=colore]').forEach((r) => r.onchange = () => { app.querySelectorAll('input[name=colore] + .pallino').forEach((s) => { s.textContent = ''; s.style.boxShadow = ''; }); const s = r.nextElementSibling; s.textContent = '✓'; s.style.boxShadow = `0 0 0 3px var(--carta),0 0 0 5px ${r.value}`; });
  document.getElementById('f-profilo').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const n = (v) => (v === '' || v == null ? null : Number(v));
    const { error } = await sb.from('tav_membri').update({ nome: d.nome.trim(), altezza_cm: n(d.altezza_cm), anno_nascita: n(d.anno_nascita), obiettivo_kg: n(d.obiettivo_kg), kcal_giorno: n(d.kcal_giorno), preferenze: d.preferenze.trim() || null, colore: d.colore || me.colore, condividi_progressi: !!d.condividi_progressi }).eq('user_id', me.user_id);
    if (error) return errore(error);
    await caricaMe(); avviso('Profilo salvato');
  };
  app.querySelectorAll('[data-pesata]').forEach((el) => el.onclick = () => modificaPesata(p.find((x) => x.id === el.dataset.pesata), vistaIo));
  attivaGrafico();
}

function cartaValore(p, campo, titolo, unita, menoEMeglio, nota = '') {
  const v = p.filter((x) => x[campo] != null);
  const u = v[v.length - 1], prec = v[v.length - 2];
  if (!u) return `<div class="blocco"><p class="tenue piccolo" style="margin:0">${titolo}</p><p class="tenue piccolo">Lo trovi sulla bilancia Renpho.</p></div>`;
  const d = prec ? Number(u[campo]) - Number(prec[campo]) : 0;
  const bene = menoEMeglio ? d <= 0 : d >= 0;
  return `<div class="blocco"><p class="tenue piccolo" style="margin:0">${titolo}</p><p class="numero">${num(u[campo], campo === 'muscoli_kg' ? 2 : 1)}${unita ? `<small>${unita}</small>` : ''}</p>
    ${prec ? `<p class="variazione ${bene ? 'giu' : 'su'}">${d === 0 ? 'stabile' : `${d < 0 ? '−' : '+'}${num(Math.abs(d), 2)}`} dalla volta prima</p>` : nota ? `<p class="tenue piccolo" style="margin:0">${nota}</p>` : ''}</div>`;
}
// Dice in parole se il peso perso è grasso o muscolo (confronto con la prima misura completa)
function letturaComposizione(p) {
  const c = p.filter((x) => x.peso_kg && x.grasso_pct && x.muscoli_kg && x.giorno >= piuGiorni(oggi(), -90));
  if (c.length < 2) return '';
  const a = c[0], b = c[c.length - 1];
  const grassoA = a.peso_kg * a.grasso_pct / 100, grassoB = b.peso_kg * b.grasso_pct / 100;
  const dP = b.peso_kg - a.peso_kg, dG = grassoB - grassoA, dM = b.muscoli_kg - a.muscoli_kg;
  const segno = (x) => `${x < 0 ? '−' : '+'}${num(Math.abs(x))} kg`;
  const giudizio = dG < 0 && dM >= -0.3 ? 'Bene: stai perdendo grasso e tenendo i muscoli.'
    : dG < 0 ? 'Stai perdendo grasso, ma anche un po\' di muscolo: proteine a ogni pasto e un po\' di forza aiutano.'
    : dG > 0 ? 'Il grasso è salito: conta la media delle prossime settimane, non la singola pesata.' : 'Grasso stabile.';
  return `<div class="blocco verde"><p style="margin:0 0 4px"><b>Dal ${daYmd(a.giorno).getDate()} ${MESI[daYmd(a.giorno).getMonth()]}:</b> peso ${segno(dP)}, di cui grasso ${segno(dG)} e muscoli ${segno(dM)}.</p><p class="piccolo" style="margin:0">${giudizio}</p></div>`;
}

async function nuovaPesata(dopo) { return modificaPesata(null, dopo); }
async function modificaPesata(x, dopo) {
  const r = await finestra(`
    <h2>${x ? 'Misure del ' + dataMedia(x.giorno) : 'Peso e misure'}</h2>
    <p class="tenue piccolo">Al mattino, a digiuno, dopo il bagno. Copia i valori dalla bilancia Renpho: basta il peso, il resto è facoltativo.</p>
    <label class="campo">Giorno<input type="date" name="giorno" value="${x?.giorno || oggi()}" required></label>
    <div class="riga-campi">
      <label class="campo">Peso (kg)<input type="number" name="peso_kg" value="${x?.peso_kg ?? ''}" min="20" max="300" step="0.05" inputmode="decimal" required></label>
      <label class="campo">Grasso (%)<input type="number" name="grasso_pct" value="${x?.grasso_pct ?? ''}" min="3" max="70" step="0.1" inputmode="decimal"></label>
    </div>
    <div class="riga-campi">
      <label class="campo">Massa muscolare (kg)<input type="number" name="muscoli_kg" value="${x?.muscoli_kg ?? ''}" min="10" max="150" step="0.01" inputmode="decimal"></label>
      <label class="campo">Grasso viscerale<input type="number" name="viscerale" value="${x?.viscerale ?? ''}" min="1" max="60" step="1" inputmode="numeric"></label>
      <label class="campo">Acqua (%)<input type="number" name="acqua_pct" value="${x?.acqua_pct ?? ''}" min="20" max="80" step="0.1" inputmode="decimal"></label>
    </div>
    <div class="azioni">${x ? '<button class="btn elimina" value="elimina" formnovalidate>Elimina</button>' : ''}<button class="btn secondario" value="annulla" formnovalidate>Annulla</button><button class="btn" value="salva">Salva</button></div>`);
  if (!r) return;
  const n = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
  let res;
  if (r.azione === 'elimina') res = await sb.from('tav_pesate').delete().eq('id', x.id);
  else if (x) res = await sb.from('tav_pesate').update({ giorno: r.giorno, peso_kg: n(r.peso_kg), grasso_pct: n(r.grasso_pct), muscoli_kg: n(r.muscoli_kg), viscerale: n(r.viscerale), acqua_pct: n(r.acqua_pct) }).eq('id', x.id);
  else res = await sb.from('tav_pesate').insert({ user_id: S.me.user_id, giorno: r.giorno, peso_kg: n(r.peso_kg), grasso_pct: n(r.grasso_pct), muscoli_kg: n(r.muscoli_kg), viscerale: n(r.viscerale), acqua_pct: n(r.acqua_pct) });
  if (res.error) return errore(res.error);
  avviso(r.azione === 'elimina' ? 'Misura eliminata' : 'Misure salvate');
  dopo();
}

// grafico del peso: una linea, l'obiettivo tratteggiato, tooltip al passaggio
function graficoPeso(punti, obiettivo) {
  const L = 640, H = 300, m = { s: 58, d: 16, a: 26, b: 44 };
  const t = punti.map((p) => daYmd(p.giorno).getTime());
  const v = punti.map((p) => Number(p.peso_kg));
  let min = Math.min(...v, obiettivo ?? Infinity), max = Math.max(...v, obiettivo ?? -Infinity);
  const margine = Math.max(0.5, (max - min) * 0.15); min = Math.floor(min - margine); max = Math.ceil(max + margine);
  const t0 = t[0], t1 = t[t.length - 1] === t0 ? t0 + 864e5 : t[t.length - 1];
  const x = (ti) => m.s + ((ti - t0) / (t1 - t0)) * (L - m.s - m.d);
  const y = (vi) => m.a + (1 - (vi - min) / (max - min)) * (H - m.a - m.b);
  const passo = Math.max(1, Math.ceil((max - min) / 4));
  const tacche = []; for (let k = Math.ceil(min); k <= max; k += passo) tacche.push(k);
  const linea = punti.map((p, i) => `${i ? 'L' : 'M'}${x(t[i]).toFixed(1)} ${y(v[i]).toFixed(1)}`).join(' ');
  const dati = JSON.stringify(punti.map((p, i) => ({ x: x(t[i]), y: y(v[i]), g: dataConMese(p.giorno), v: num(v[i]) })));
  return `<div class="grafico" data-punti='${esc(dati)}' data-l="${L}" data-h="${H}">
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Andamento del peso: da ${num(v[0])} a ${num(v[v.length - 1])} kg">
      ${tacche.map((k) => `<line x1="${m.s}" x2="${L - m.d}" y1="${y(k)}" y2="${y(k)}" stroke="#E3EDDF"/><text x="${m.s - 8}" y="${y(k) + 4}" text-anchor="end" font-size="20" fill="#4D6358">${k}</text>`).join('')}
      ${obiettivo ? `<line x1="${m.s}" x2="${L - m.d}" y1="${y(obiettivo)}" y2="${y(obiettivo)}" stroke="#F39A2E" stroke-width="2" stroke-dasharray="6 5"/><text x="${L - m.d}" y="${y(obiettivo) - 7}" text-anchor="end" font-size="20" font-weight="700" fill="#9A5208">obiettivo ${num(obiettivo)} kg</text>` : ''}
      <path d="${linea}" fill="none" stroke="#2F7A4D" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${punti.map((p, i) => `<circle cx="${x(t[i])}" cy="${y(v[i])}" r="6.5" fill="#2F7A4D" stroke="#fff" stroke-width="3"/>`).join('')}
      <text x="${m.s}" y="${H - 10}" font-size="20" fill="#4D6358">${dataConMese(punti[0].giorno)}</text>
      <text x="${L - m.d}" y="${H - 10}" font-size="20" fill="#4D6358" text-anchor="end">${dataConMese(punti[punti.length - 1].giorno)}</text>
      <line class="mirino" x1="0" x2="0" y1="${m.a}" y2="${H - m.b}" stroke="#17332A" stroke-opacity=".25" visibility="hidden"/>
      <rect x="${m.s}" y="0" width="${L - m.s - m.d}" height="${H}" fill="transparent" class="area"/>
    </svg><div class="tooltip"></div></div>`;
}
function attivaGrafico() {
  app.querySelectorAll('.grafico').forEach((g) => {
    const punti = JSON.parse(g.dataset.punti), L = Number(g.dataset.l);
    const svg = g.querySelector('svg'), tip = g.querySelector('.tooltip'), mir = g.querySelector('.mirino');
    const muovi = (e) => {
      const r = svg.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * L;
      const p = punti.reduce((a, b) => (Math.abs(b.x - sx) < Math.abs(a.x - sx) ? b : a));
      mir.setAttribute('x1', p.x); mir.setAttribute('x2', p.x); mir.setAttribute('visibility', 'visible');
      tip.style.display = 'block'; tip.style.left = `${(p.x / L) * r.width}px`; tip.style.top = `${(p.y / Number(g.dataset.h)) * r.height}px`;
      tip.innerHTML = `<b>${p.v} kg</b> · ${p.g}`;
    };
    const esci = () => { tip.style.display = 'none'; mir.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', muovi); svg.addEventListener('pointerdown', muovi); svg.addEventListener('pointerleave', esci);
  });
}

// ---------------------------------------------------------------- SPORT
async function vistaSport() {
  const { data: att } = await sb.from('tav_attivita').select('*').eq('user_id', S.me.user_id).order('giorno', { ascending: false }).limit(30);
  const a = att || [];
  const lun = lunediDi(oggi());
  const sett = a.filter((x) => x.giorno >= lun);
  const tot = (k) => sett.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const ultima = a[0];
  const extra = ultima?.giorno === oggi() && ultima.kcal ? Math.round(ultima.kcal / 2 / 50) * 50 : null;
  pagina('io', `
    ${testata('Sport e attività', 'Muoversi e mangiare il giusto', { indietro: '#/io' })}
    ${extra ? `<section class="stasera"><p class="quando">Oggi hai bruciato circa ${ultima.kcal} kcal</p><p class="piatto-grande">Stasera puoi mangiare circa ${extra} kcal in più</p>
      <p class="resto">È la metà di quello che hai bruciato: recuperi le energie senza azzerare il deficit. Vuol dire una porzione più grande di pasta o riso e un buon secondo con le proteine.</p>
      <div class="azioni"><a class="btn" href="#/chiedi?q=${encodeURIComponent(`Oggi ho fatto ${ultima.tipo}${ultima.km ? ` per ${ultima.km} km` : ''}${ultima.durata_min ? ` in ${ultima.durata_min} minuti` : ''}, circa ${ultima.kcal} kcal. Cosa mangio stasera?`)}">Chiedi cosa mangiare</a></div></section>` : ''}
    <h2>Questa settimana</h2>
    <div class="due" style="grid-template-columns:repeat(3,1fr)">
      <div class="blocco"><p class="tenue piccolo" style="margin:0">Attività</p><p class="numero">${sett.length}</p></div>
      <div class="blocco"><p class="tenue piccolo" style="margin:0">Minuti</p><p class="numero">${tot('durata_min')}</p></div>
      <div class="blocco"><p class="tenue piccolo" style="margin:0">kcal</p><p class="numero">${num(tot('kcal'), 0)}</p></div>
    </div>
    <h2>Registra un'attività</h2>
    <form class="blocco" id="f-sport">
      <div class="riga-campi">
        <label class="campo">Cosa<select name="tipo">${TIPI_SPORT.map((t) => `<option>${t}</option>`).join('')}</select></label>
        <label class="campo">Giorno<input type="date" name="giorno" value="${oggi()}" required></label>
      </div>
      <div class="riga-campi">
        <label class="campo">Minuti<input type="number" name="durata_min" min="1" max="1440" inputmode="numeric"></label>
        <label class="campo">Km<input type="number" name="km" min="0" max="500" step="0.1" inputmode="decimal"></label>
        <label class="campo">kcal<small>dall'app della bici o dell'orologio</small><input type="number" name="kcal" min="0" max="10000" inputmode="numeric"></label>
      </div>
      <label class="campo">Nota<input type="text" name="note" maxlength="200" placeholder="Per esempio: metà in Eco, giro del Ticino"></label>
      <button class="btn">Salva l'attività</button>
    </form>
    <div class="blocco verde"><h3>Quanto mangiare quando ti muovi</h3>
      <ul style="padding-left:20px;margin:0">
        <li>Recupera circa <b>metà</b> delle calorie bruciate, non tutte: così il peso continua a scendere.</li>
        <li>Dopo uno sforzo lungo: più carboidrati a cena (pasta, riso, patate) e un secondo proteico.</li>
        <li>Bevi tanto, anche senza sete. Dopo un giro lungo il peso del giorno dopo può salire per l'acqua: è normale.</li>
        <li>In e-bike, usa più spesso Eco: lavori di più tu.</li>
      </ul></div>
    ${a.length ? `<h2>Ultime attività</h2><ul class="lista-spesa">${a.map((x) => `<li><span class="nome"><b>${esc(x.tipo)}</b><small>${[maiuscola(dataMedia(x.giorno)), x.durata_min && `${x.durata_min} min`, x.km && `${num(x.km)} km`, x.kcal && `${x.kcal} kcal`, x.note].filter(Boolean).map(esc).join(' · ')}</small></span>
      <button class="icona-btn" data-via="${x.id}" aria-label="Elimina attività" style="width:38px;height:38px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></li>`).join('')}</ul>` : ''}
    ${FIRMA}`);
  document.getElementById('f-sport').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const n = (v) => (v === '' ? null : Number(String(v).replace(',', '.')));
    const { error } = await sb.from('tav_attivita').insert({ user_id: S.me.user_id, tipo: d.tipo, giorno: d.giorno, durata_min: n(d.durata_min), km: n(d.km), kcal: n(d.kcal), note: d.note.trim() || null });
    if (error) return errore(error);
    avviso('Attività salvata'); vistaSport();
  };
  app.querySelectorAll('[data-via]').forEach((b) => b.onclick = async () => {
    if (!(await conferma('Eliminare questa attività?', 'Elimina'))) return;
    await sb.from('tav_attivita').delete().eq('id', b.dataset.via); vistaSport();
  });
}

// ---------------------------------------------------------------- FAMIGLIA
async function vistaFamiglia() {
  await caricaMe();
  const condividono = S.membri.filter((m) => m.condividi_progressi && m.user_id !== S.me.user_id).map((m) => m.user_id);
  let progressi = {};
  if (condividono.length) {
    const { data } = await sb.from('tav_pesate').select('user_id, giorno, peso_kg').in('user_id', condividono).order('giorno');
    for (const p of data || []) { (progressi[p.user_id] ||= []).push(p); }
  }
  const admin = S.me.ruolo === 'admin';
  const invito = `Ciao! Entra nella nostra "Grande Famiglia a Tavola": apri ${location.origin}${location.pathname}, tocca "Crea il tuo account" e usa il codice famiglia ${S.famiglia.codice}`;
  pagina('io', `
    ${testata(esc(S.famiglia.nome), 'La famiglia', { indietro: '#/io' })}
    <ul class="membri">${S.membri.map((m) => {
      const pr = progressi[m.user_id];
      const diff = pr && pr.length >= 2 ? pr[pr.length - 1].peso_kg - pr[0].peso_kg : null;
      return `<li><span class="pallino" style="background:${esc(m.colore)}">${esc(iniziale(m.nome))}</span><div style="flex:1"><b>${esc(m.nome)}</b>${m.user_id === S.me.user_id ? ' (tu)' : ''}<br><small class="tenue">${m.ruolo === 'admin' ? 'Ha creato la famiglia' : 'In famiglia'}${m.condividi_progressi ? ' · condivide i progressi' : ''}</small></div>
        ${diff != null ? `<span class="variazione ${diff <= 0 ? 'giu' : 'su'}">${diff <= 0 ? '−' : '+'}${num(Math.abs(diff))} kg</span>` : ''}</li>`;
    }).join('')}</ul>
    <h2>Invita qualcuno</h2>
    <div class="blocco verde">
      <p class="tenue piccolo" style="margin:0">Codice famiglia</p><p class="codice">${esc(S.famiglia.codice)}</p>
      <p>Chi ha il codice crea il suo account e si siede a tavola con voi: vede menu e spesa, mentre peso e attività restano privati se non sceglie di condividerli.</p>
      <p class="azioni"><a class="btn" href="https://wa.me/?text=${encodeURIComponent(invito)}" target="_blank" rel="noopener">Invia su WhatsApp</a><button class="btn secondario" id="copia-cod">Copia il codice</button></p>
    </div>
    ${admin ? `<h2>Nome della famiglia</h2><form class="blocco riga" id="f-fam"><input type="text" name="nome" value="${esc(S.famiglia.nome)}" required maxlength="60" class="cresci" aria-label="Nome della famiglia"><button class="btn">Salva</button></form>` : ''}
    ${FIRMA}`);
  document.getElementById('copia-cod').onclick = async () => { try { await navigator.clipboard.writeText(S.famiglia.codice); avviso('Codice copiato'); } catch { prompt('Codice famiglia', S.famiglia.codice); } };
  const ff = document.getElementById('f-fam');
  if (ff) ff.onsubmit = async (e) => { e.preventDefault(); const { error } = await sb.from('tav_famiglie').update({ nome: new FormData(ff).get('nome').trim() }).eq('id', S.famiglia.id); if (error) return errore(error); avviso('Nome salvato'); vistaFamiglia(); };
}

// ---------------------------------------------------------------- GUIDA
function vistaGuida() {
  pagina('io', `
    ${testata('Guida', 'Come si usa', { indietro: '#/oggi', extra: false })}
    <article class="guida">
      <p>La Grande Famiglia a Tavola tiene insieme quello che si mangia, quello che si compra e come sta andando ognuno. Menu e spesa sono di tutta la famiglia; peso, misure e attività sono di ciascuno.</p>
      <h2>Oggi</h2>
      <p>Apri il sito e trovi subito la cena di stasera in grande, la giornata con tutti i pasti da spuntare, cosa si mangia domani e se manca qualcosa da comprare. Il tasto "Chiedi una sostituzione" porta la cena dentro la domanda a Claude.</p>
      <h2>Settimana</h2>
      <ul>
        <li>Ogni giorno è una tabella: colazione, spuntini, pranzo, cena e dopo cena. Gli spuntini si possono nascondere.</li>
        <li>Tocca un piatto per cambiarlo, spostarlo di giorno o eliminarlo. La spunta segna che è stato mangiato.</li>
        <li>Settimana vuota? "Carica la settimana tipo" mette il menu del piano, "Copia la settimana precedente" ripete l'ultima.</li>
      </ul>
      <h2>Spesa</h2>
      <div class="passo"><b class="n">1</b><p><b>Lista della spesa</b>: quello che c'è da comprare, diviso per reparto. Al supermercato spunta quello che metti nel carrello.</p></div>
      <div class="passo"><b class="n">2</b><p><b>Un giorno</b> (Oggi, Domani, Mar 27…): vedi gli ingredienti dei pasti di quel giorno. Se una cosa non ce l'hai, tocca <b>Manca</b> e finisce nella lista. Puoi scegliere più giorni insieme.</p></div>
      <div class="passo"><b class="n">3</b><p>In fondo alla lista, "Già comprato" tiene quello che hai in casa: quando una cosa finisce, toccala e torna in lista.</p></div>
      <div class="passo"><b class="n">4</b><p>Gli ingredienti di un pasto si cambiano dal menu: tocca il piatto e scrivili uno per riga, con la quantità.</p></div>
      <h2>Promemoria sul telefono</h2>
      <p>In "Io" tocca "Aggiungi al calendario" e conferma l'iscrizione. Il calendario del telefono ti avvisa da solo:</p>
      <ul><li>alle 7:00 con il menu di oggi;</li><li>alle 20:30 con il menu di domani e le cose che mancano da comprare.</li></ul>
      <p>Su iPhone: Impostazioni › Calendario › Account, controlla che il calendario "A tavola" sia attivo e che le notifiche del Calendario siano accese. Il telefono aggiorna il calendario da solo ogni qualche ora.</p>
      <h2>Chiedi a Claude</h2>
      <p>Chiedi se puoi sostituire un alimento, quanto mangiarne, cosa portare al lavoro, cosa mangiare dopo lo sport o se un prodotto va bene. Claude vede il menu di famiglia, il tuo profilo, le preferenze, gli ultimi pesi e le attività. Parla solo di alimentazione, spesa e benessere: per il resto risponde che non è la persona giusta. Non sostituisce il medico.</p>
      <p><b>A voce:</b> tocca il microfono accanto alla casella e parla. Quando smetti, la domanda parte da sola e la risposta viene letta ad alta voce. Su ogni risposta c'è anche il tasto "Ascolta". La voce è gratis: la fa il telefono. La prima volta il browser chiede il permesso di usare il microfono.</p>
      <h3>Attivare Chiedi a Claude</h3>
      <p>È l'unica parte a pagamento. Serve una chiave API Anthropic:</p>
      <ol><li>Su console.anthropic.com crea l'account, aggiungi un po' di credito e crea una chiave API.</li>
      <li>Su Supabase, progetto nosplash › Edge Functions › Secrets, aggiungi <b>ANTHROPIC_API_KEY</b> con la chiave.</li>
      <li>Fatto: la funzione è già pronta. Ogni persona può fare fino a 40 domande al giorno.</li></ol>
      <h2>Io, peso e sport</h2>
      <ul>
        <li>Registra peso, grasso, massa muscolare, grasso viscerale e acqua copiandoli dalla bilancia Renpho. Il sito ti dice se stai perdendo grasso o muscolo. Conta l'andamento del mese, non la singola pesata.</li>
        <li>Nel profilo metti altezza, obiettivo, calorie e cosa eviti: Claude ne tiene conto.</li>
        <li>In "Sport e attività" registri giri in bici, camminate e allenamenti. Se segni le calorie, il sito ti dice quanto puoi mangiare in più la sera.</li>
      </ul>
      <h2>Privacy</h2>
      <ul>
        <li>Menu e lista della spesa sono visibili a tutta la famiglia.</li>
        <li>Peso, misure, attività e conversazioni con Claude sono solo tuoi. Se attivi "Mostra i miei progressi alla famiglia", gli altri vedono peso e attività, mai le conversazioni.</li>
        <li>I dati stanno su Supabase (Unione Europea, Irlanda). Le domande a Claude passano ad Anthropic solo per avere la risposta.</li>
        <li>Per cancellare il tuo account e tutti i tuoi dati scrivi a Marco.</li>
      </ul>
    </article>
    ${FIRMA}`);
}

// ---------------------------------------------------------------- avvio e percorsi
async function mostra() {
  if (!S.sessione) return vistaAccesso();
  if (!S.me) return vistaUnisciti();
  const [percorso, query] = (location.hash.replace(/^#\/?/, '') || 'oggi').split('?');
  const param = Object.fromEntries(new URLSearchParams(query || ''));
  try {
    switch (percorso) {
      case 'settimana': return await vistaSettimana();
      case 'spesa': return await vistaSpesa();
      case 'chiedi': return await vistaChiedi(param);
      case 'io': return await vistaIo();
      case 'sport': return await vistaSport();
      case 'famiglia': return await vistaFamiglia();
      case 'guida': return vistaGuida();
      default: return await vistaOggi();
    }
  } catch (e) { errore(e); }
}

window.addEventListener('hashchange', mostra);
let ultimoUtente = null;
// (le chiamate a Supabase vanno fuori dal callback, altrimenti la sessione si blocca)
sb.auth.onAuthStateChange((_evento, sessione) => {
  S.sessione = sessione;
  const uid = sessione?.user?.id || null;
  if (uid === ultimoUtente && S.me) return;
  ultimoUtente = uid;
  setTimeout(async () => {
    S.me = null;
    if (sessione) { try { await caricaMe(); } catch (e) { errore(e); } }
    mostra();
  }, 0);
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

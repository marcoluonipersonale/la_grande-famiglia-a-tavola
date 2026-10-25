# La Grande Famiglia a Tavola

Il menu di famiglia, la spesa divisa in uscite, i promemoria sul telefono, i progressi di ognuno e "Chiedi a Claude". By Marco Luoni.

Web app da telefono (si installa sulla schermata Home), in JavaScript senza build, come NoSplash ed eMTB ML.

## Sezioni
- **Oggi**: la cena di stasera in grande, la giornata da spuntare, domani, cosa manca, prossima spesa, peso.
- **Settimana**: tabella per giorno (colazione, spuntini, pranzo, cena, dopo cena); settimana tipo del piano o copia della precedente.
- **Spesa**: lista divisa in *uscite* (giri al supermercato). Ogni cosa ha un "serve per il" e finisce nell'ultima uscita utile; "arriva tardi" se è nell'uscita sbagliata. Viste per uscita, per reparto e "in casa".
- **Chiedi**: Claude risponde solo su alimentazione, spesa e benessere (unica parte a pagamento).
- **Io**: peso, grasso, giro vita, grafico, profilo e preferenze, promemoria nel calendario, condivisione dei progressi.
- **Sport**, **Famiglia** (codice invito, WhatsApp), **Guida** (anche privacy).

## Dati
Progetto Supabase `nosplash` (stesso di NoSplash), tabelle con prefisso `tav_`, separate e protette da regole di accesso. Vedi `supabase/schema.sql`.

Funzioni sul server (`supabase/functions`):
- `tav-registrati`: crea l'account solo con codice famiglia valido.
- `tav-calendario?t=<token>`: feed iCalendar personale con i promemoria (7:00 oggi, 20:30 domani e cosa manca, 9:00 giorni di spesa).
- `tav-chiedi`: Chiedi a Claude. Serve il segreto `ANTHROPIC_API_KEY` (facoltativo `ANTHROPIC_MODEL`). Limite 40 domande al giorno a persona.

## Pubblicazione
Netlify collegato a questo repository (cartella pubblicata: la radice). Ogni push su `main` aggiorna il sito.

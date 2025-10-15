Lai palaistu kodu jāatver 2 termināli: viens ir `cd Spots/client` un otrs ir `cd Spots/server`. Abos jāizpilda `npm install` un tad `npm run dev`.
Servera pusei nepieciešams PostgreSQL savienojums (piemēram, Supabase). Konfigurācijai izmanto `DATABASE_URL` vai `SUPABASE_DB_URL`
mainīgo ar pilno savienojuma virkni. Ja Supabase parole satur speciālos simbolus (piemēram, `[` vai `]`), pārliecinies, ka tie ir
URL kodēti (`%5B`, `%5D`). Ja Supabase prasa SSL, vari iestatīt `DB_SSL=true` (Supabase savienojumiem SSL tiek ieslēgts automātiski
arī bez šī mainīgā).

Lai testētu https://developer.chrome.com/docs/lighthouse/overview/

Frontend (`client`) pusei nepieciešams konfigurēt vidi:
- `VITE_API_BASE_URL` – API servera bāzes URL (piem., Vercel resursam vai `http://localhost:5000`).
- `VITE_SUPABASE_ANON_KEY` – Supabase anon atslēga, kas tiek izmantota, lai pieprasījumiem pievienotu nepieciešamo `apikey` galveni.

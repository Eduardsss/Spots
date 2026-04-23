# Spotz

Spotz ir interaktīva karšu platforma, kurā lietotāji var pievienot, apskatīt un koplietot interesantas vietas ("spotus") uz Google Maps kartes. Katram spotam var pievienot fotogrāfijas, tagus, aprakstu un statusu (publisks/privāts). Lietotāji var atzīmēt vietas kā apmeklētas, sekot savam apmeklējumu streakam, atstāt komentārus un saglabāt spotus kolekcijās.

---

## Tehnoloģijas

| Slānis | Tehnoloģija |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Maršrutēšana | React Router v6 |
| Karte | Google Maps JavaScript API (`@react-google-maps/api`) |
| Backend | Node.js, Express.js (ES modules) |
| Autentifikācija | JWT (`jsonwebtoken`), paroles heša — `bcryptjs` |
| Datubāze | Supabase (PostgreSQL) |
| Frontend izvietošana | Vercel |
| Backend izvietošana | Render.com |

---

## Projekta struktūra

```
Spots/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── components/      # Atkārtoti lietojami komponenti (Header, SpotGallery, TagInput u.c.)
│   │   ├── pages/           # Lapas (MapPage, PublicSpotsPage, MySpotsPage, CollectionsPage u.c.)
│   │   ├── lib/             # Palīgfunkcijas (API klients, tagu loģika)
│   │   └── styles/          # Globālais CSS un dizaina tēma
│   ├── .env                 # Klienta vides mainīgie (jāizveido pašam)
│   └── vercel.json          # Vercel SPA maršrutēšanas konfigurācija
│
├── server/                  # Express.js backend
│   ├── src/
│   │   ├── routes/          # API maršruti (spots, auth, users, collections, admin, reports)
│   │   ├── middleware/       # JWT autentifikācijas middleware
│   │   └── db.js            # Supabase klienta inicializācija
│   ├── server.js            # Ieejas punkts
│   ├── .env                 # Servera vides mainīgie (jāizveido pašam)
│   └── render.yaml          # Render.com izvietošanas konfigurācija
│
├── schema.sql               # Datubāzes shēma (jāizpilda Supabase SQL editorā)
└── README.md
```

---

## Lokālā palaišana no nulles

### Priekšnoteikumi

- Node.js v18 vai jaunāks
- npm v9 vai jaunāks
- Supabase konts ar izveidotu projektu
- Google Maps API atslēga ar iespējotiem pakalpojumiem: **Maps JavaScript API** un **Directions API**

---

### 1. solis — Datubāzes uzstādīšana (Supabase)

1. Atver savu Supabase projektu → **SQL Editor**
2. Ielīmē un izpildi visu faila `server/schema.sql` saturu
3. Tas izveidos visas nepieciešamās tabulas: `users`, `spots`, `spot_images`, `spot_tags`, `likes`, `visits`, `comments`, `collections`, `collection_spots`, `reports`

---

### 2. solis — Servera uzstādīšana

```bash
cd server
npm install
```

Izveido failu `server/.env` ar šādu saturu:

```env
SUPABASE_URL=https://<tava-projekta-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-atslēga>
JWT_SECRET=<jebkura-gara-nejaušu-simbolu-virkne>
ALLOWED_ORIGINS=http://localhost:5173
PORT=3000
```

> **Kur atrast Supabase atslēgas:**
> Supabase projekts → **Project Settings → API**
> - `SUPABASE_URL` — lauks "Project URL"
> - `SUPABASE_SERVICE_ROLE_KEY` — lauks "service_role" (zem "Project API keys")

Palaid serveri:

```bash
npm start
```

Serveris startē uz `http://localhost:3000`. Pārbaudi ar `http://localhost:3000/health` — atbildei jābūt `{"ok":true}`.

---

### 3. solis — Klienta uzstādīšana

```bash
cd client
npm install
```

Izveido failu `client/.env` ar šādu saturu:

```env
VITE_GOOGLE_MAPS_API_KEY=<tava-google-maps-api-atslēga>
VITE_API_BASE_URL=http://localhost:3000
```

> **Kā iegūt Google Maps API atslēgu:**
> 1. Atver [Google Cloud Console](https://console.cloud.google.com/)
> 2. Izveido projektu vai izvēlies esošu
> 3. Iespējo: **Maps JavaScript API** un **Directions API**
> 4. Sadaļā **Credentials** izveido API atslēgu

Palaid klientu:

```bash
npm run dev
```

Lietotne pieejama: `http://localhost:5173`

---

## API maršruti (kopsavilkums)

| Metode | Maršruts | Apraksts |
|---|---|---|
| POST | `/auth/register` | Jauna lietotāja reģistrācija |
| POST | `/auth/login` | Pieteikšanās, saņem JWT tokenu |
| GET | `/spots` | Iegūst spotus (ar filtriem: `visibility`, `ownerId`, `tag`) |
| POST | `/spots` | Izveido jaunu spotu (autorizācija vajadzīga) |
| PUT | `/spots/:id` | Rediģē spotu |
| DELETE | `/spots/:id` | Dzēš spotu |
| GET | `/spots/nearby` | Tuvumā esošie neapmeklētie spoti (atklāšanas režīms) |
| POST | `/spots/:id/like` | Pievieno "patīk" |
| DELETE | `/spots/:id/like` | Noņem "patīk" |
| POST | `/spots/:id/visit` | Atzīmē spotu kā apmeklētu |
| DELETE | `/spots/:id/visit` | Noņem apmeklējumu |
| GET | `/spots/visits/streak` | Apmeklējumu streaka statistika |
| GET | `/spots/:id/comments` | Iegūst komentārus |
| POST | `/spots/:id/comments` | Pievieno komentāru |
| GET | `/collections` | Iegūst lietotāja kolekcijas |
| POST | `/collections` | Izveido kolekciju |
| PUT | `/users/me` | Atjaunina profilu (lietotājvārds, profilbilde) |
| POST | `/reports` | Ziņo par neatbilstošu saturu |
| GET | `/admin/reports` | Admin: apskata ziņojumus |

---

## Galvenās funkcijas

- **Karte** — interaktīva Google Maps karte ar marķieriem katram spotam. Uzklikšķinot uz kartes, var izveidot jaunu spotu.
- **Filtri** — spotus var filtrēt pēc redzamības (publisks/privāts/mani), autora un tagiem.
- **Spotu detaļu popup** — uzklikšķinot uz marķiera, parādās kartīte ar attēliem, aprakstu, tagiem, maršrutu un darbību pogām.
- **Atklāšanas režīms** — parāda neapmeklētos publiskos spotus lietotāja tuvumā (izmanto ģeolokāciju).
- **Streak sistēma** — seko, cik dienas pēc kārtas lietotājs ir apmeklējis jaunu spotu.
- **Kolekcijas** — lietotāji var grupēt savus sportos kolekcijās.
- **Admin panelis** — lietotāji ar lomu `admin` var apskatīt un apstrādāt satura ziņojumus.

---

## Izvietošana (produkcija)

### Frontend → Vercel

1. Savienot GitHub repozitoriju ar Vercel
2. Iestatīt **Root Directory**: `client`
3. Pievienot vides mainīgos Vercel projektā:
   - `VITE_GOOGLE_MAPS_API_KEY`
   - `VITE_API_BASE_URL` — adreses uz Render.com serveri

### Backend → Render.com

Render.com automātiski nolasa `render.yaml` konfigurāciju no repozitorija saknes.

Manuāli jāpievieno vides mainīgie Render.com dashboardā:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `ALLOWED_ORIGINS` — Vercel frontend adrese (piemēram, `https://spotz.vercel.app`)

---

## Vides mainīgo kopsavilkums

### `server/.env`

| Mainīgais | Apraksts |
|---|---|
| `SUPABASE_URL` | Supabase projekta URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role atslēga (ar pilnu piekļuvi DB) |
| `JWT_SECRET` | Slepena virkne JWT tokenu parakstīšanai |
| `ALLOWED_ORIGINS` | Komatatdalīts atļauto CORS izcelsmes saraksts |
| `PORT` | Porta numurs (noklusējums: `3000`) |

### `client/.env`

| Mainīgais | Apraksts |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API atslēga |
| `VITE_API_BASE_URL` | Backend API adrese (lokāli: `http://localhost:3000`) |

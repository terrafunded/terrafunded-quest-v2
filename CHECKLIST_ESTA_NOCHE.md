# Quest v2 — qué hacer esta noche antes de darle "go" a Cursor

Tiempo estimado: 30 a 40 minutos. En orden.

## 0. Seguridad (antes de cualquier otra cosa)

1. En el zip de Quest v1, el archivo `src/lib/anthropic.ts` trae una API key de Anthropic
   escrita en el código, y ese código va al navegador de cualquier usuario. Entra a
   https://console.anthropic.com/settings/keys y **revoca esa llave ahora**. Crea una nueva
   solo si la vas a usar desde un backend.
2. La `api_secret_key` de Quest (la que empieza con `tfq_`) quedó en el export que pegaste aquí.
   Rótala en Quest v1 (Settings → API) o déjala inactiva.

## 1. Repo nuevo en GitHub

1. Crea el repo `terrafunded-quest-v2` (privado).
2. Clónalo a tu Mac: `git clone <url> ~/quest-v2 && cd ~/quest-v2`
3. Copia dentro:
   - `GOAL.md` en la raíz
   - `docs/payments_schema.md`
   - el código de Quest v1 en `reference/quest-v1/` (solo `src/`, `tailwind.config.ts`,
     `index.css`; NO copies `src/lib/anthropic.ts` ni `src/lib/supabase.ts`)
4. Crea `.env.example` con exactamente estas líneas (sin valores):
   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
   QUEST_TEST_EMAIL=
   QUEST_TEST_PASSWORD=
   ```
5. `git add . && git commit -m "chore: goal spec, schema reference, v1 reference" && git push`

## 2. Usuario de solo lectura en Payments

1. En payments.terrafunded.com → Settings → Users, crea `quest-bot@terrafunded.com`
   con rol **viewer**. Contraseña larga y única.
2. Verifica que ese usuario puede leer las tablas. Entra al SQL Editor de Supabase
   (proyecto rruscfrrukagpgymifhq) y corre esto **pegándolo tal cual**:
   ```sql
   select tablename, policyname, cmd, roles
   from pg_policies
   where schemaname = 'public'
     and tablename in ('file_cases','notes','properties','farm_acquisitions',
                       'investors','investor_distributions','property_costs','note_sales','clients')
   order by tablename, cmd;
   ```
   Mándame el resultado si algo no muestra `SELECT` para authenticated/viewer. Si una tabla
   no deja leer al viewer, el agente se va a atorar en esa tabla toda la noche.
3. Confirma también que la RLS de esas tablas no permite INSERT/UPDATE al rol viewer
   (mismo resultado, columna `cmd`). Ese es tu candado real de "solo lectura".

## 3. Secretos en Cursor

1. cursor.com/agents → tu repo → Settings → Environment / Secrets.
2. Agrega `VITE_SUPABASE_URL` = `https://rruscfrrukagpgymifhq.supabase.co`
3. `VITE_SUPABASE_ANON_KEY` = la anon key de Payments (Supabase → Project Settings → API).
   Es la pública, la que ya va en el bundle. **Nunca la service role.**
4. `QUEST_TEST_EMAIL` y `QUEST_TEST_PASSWORD` = el usuario del paso 2.

## 4. Lanzar

1. cursor.com/agents → New Chat → selecciona el repo `terrafunded-quest-v2`, rama `main`.
2. Modelo: el que tienes (Claude Fable 5.1 High).
3. Escribe `/goal` y pega este texto:

   > Read GOAL.md and docs/payments_schema.md in full before writing any code. Build the app
   > described in GOAL.md on a new branch `v2`. Work until every item in "Definition of Done"
   > is verified by you (build, lint, unit tests, Playwright). Keep PROGRESS.md and
   > OPEN_QUESTIONS.md current after every major step. Never write to the Payments database.
   > Never hard-code secrets. Open a PR against `main` when done.

4. Confirma que aparece en "Chats" con estatus corriendo. Cierra la laptop.

## 5. En la mañana (20 min)

1. Abre el PR. Lee **PROGRESS.md** primero, luego **OPEN_QUESTIONS.md**.
2. Corre localmente: `git checkout v2 && npm i && cp .env.example .env` (llena los valores)
   `&& npm run dev`. Abre http://localhost:5173.
3. Compara el total de la pantalla `/quests` contra $8,986,794.30. Si no cuadra, ese es el
   primer bug del día.
4. Tráeme PROGRESS.md, OPEN_QUESTIONS.md y capturas de `/` y `/quests`. De ahí armamos la
   segunda corrida.

## Qué esperar

Una noche produce una v1 sólida del núcleo: dominio con tests, datos reales, Throne Room,
ledger y probablemente sponsors. Mapa, oráculo y trofeos suelen quedar a medias. Eso es normal;
la segunda noche es para lo épico visual, ya con números que cuadran.

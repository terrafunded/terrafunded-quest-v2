**Antes de trabajar, lee `~/.claude/NEGOCIO.md`: ahí están el vocabulario y las reglas de negocio compartidas por todos los repos.**

# AGENTS.md — Terrafunded Quest v2

Instrucciones para cualquier agente de código que trabaje en este repo.

## Qué es

**Quest v2** ("Exodus", la app se titula **Quest**) es el tablero gamificado del fundador para la meta de **$10,000,000 de utilidad neta** de lotes de fincas subdivididas, con fecha límite configurable (2027, 2028 o 2029; default 2027-12-31). Tono de fantasía medieval (Throne Room, sponsors, treasury, chronicle), pero cada número sale de la base de **Payments** en tiempo real. **Quest no escribe nada**: es un frontend de solo lectura sin backend propio.

Especificación y bitácoras (en inglés):

- `GOAL.md`: la especificación original (restricciones duras, modelo de dominio, Definition of Done, fases 2, 2b y 3).
- `payments_schema.md`: las únicas columnas de Payments que Quest puede usar.
- `README.md`: setup, variables, scripts y reglas de dominio en lenguaje llano.
- `PROGRESS.md`, `OPEN_QUESTIONS.md`, `POLISH_LOG.md`, `MOBILE_LOG.md`, `DEPLOY.md`.

Datos del repo:

- Repo local: `~/repos/terrafunded-quest-v2`. Remote: `github.com/terrafunded/terrafunded-quest-v2`.
- **`main` solo tiene la especificación** (`README.md`, `GOAL.md`, `payments_schema.md`, `CHECKLIST_ESTA_NOCHE.md`). **El código vive en la rama `v2`.** El PR #1 (`v2` → `main`) sigue abierto.
- El código lo escribió el **Cursor Agent** (Cloud Agents). Trabaja en ramas `cursor/<tema>-7eee` y abre PRs contra `v2`.
- Producción: **https://terrafunded-quest-v2.vercel.app** (Vercel). Según `PROGRESS.md`, se despliega desde `v2` con la CLI de Vercel (`npm run deploy`).
- Las versiones de `GOAL.md` y `payments_schema.md` en `main` están desactualizadas respecto a `v2`. Usa las de `v2`.

## Dominio de Quest

Las reglas completas están en `README.md` §6 y en `GOAL.md`. Lo esencial:

- **Finca subdividida:** `farm_acquisitions.total_lots > 1` y que no esté en `LEGACY_FARM_NAMES` (`src/config/goal.ts`: Ben White, Sharps Rd, Olney, Red River 1). Cada `properties` de esa finca es un **lote**.
- **Etapa del lote:** `available` → `reserved` → `closed` → `note_sold`. Las ventas cash pasan directo a `closed`.
- **Precio de venta:** `notes.original_amount` si hay nota (`is_test = false`); si no, `file_cases.sale_price` de un file case `active` o `completed`; si no, el lote no está vendido.
- **Utilidad:** `grossProfit = salePrice − landCost` y `netProfit = grossProfit − investorTake`. La utilidad a la fecha suma solo lotes `closed` / `note_sold`. **Las reservas (`pipeline.ts`, `expected.ts`) nunca alimentan la meta, el ritmo ni oxygen.**
- **`investorTake` según `farm_acquisitions.deal_type`:** `profit_share` → `grossProfit × profit_share_pct / 100`; `fixed_interest` → parte del interés devengado de la finca; `own_capital` → 0.
- **Townson Family** es el único inversionista `profit_share` y tiene tratamiento visual y métricas separados.
- **Unidades de tasa:** `farm_acquisitions.annual_interest_rate` es **porcentaje** (20 = 20 %). `notes.interest_rate` es **fracción** (0.10 = 10 %). Ver `src/domain/lotLedger.ts` e `interest.ts`.
- **La Era:** `ERA_START = 2026-03-01`. Todas las tasas, promedios y tendencias se miden desde esa fecha; los totales usan toda la historia.
- **Horizonte de salida:** `EXIT_HORIZONS = [2027, 2028, 2029]`, guardado en `localStorage` (`quest.v2.exitHorizon`). El `deadline` viaja por `buildRealm` → `computeGoal`; `GOAL_DEADLINE` es solo el fallback de `computeGoal`.
- **Exodus:** devolver `LP_CAPITAL_TO_RETURN` ($10M) a los LPs en efectivo más fracciones de notas (`src/domain/exodus.ts`).
- **Lot ledger:** `src/domain/lotLedger.ts` es un port puro de la función `compute_lot_ledger` de Payments. Su paridad está fijada en `lotLedger.test.ts` contra filas reales del RPC guardadas en el fixture.

Vocabulario de pantallas: Throne Room (`/`), War Plan, Exodus, Realm (mapa), Quests (ledger de ventas), Pipeline, Sponsors (inversionistas), Treasury (caja), Oracle (what-if), Chronicle, Trophies y Quality. En el código también aparecen Debt, Oxygen, Liberation, Campaigns y Streaks (ver `README.md` §5 y §6).

## Reglas no negociables

1. **Nunca hagas `git push` a `main` sin aprobación explícita de Rodrigo.**
2. **Solo npm.** El lockfile es `package-lock.json` y Vercel instala con `npm ci`.
3. **Commits en inglés, con prefijo.** Prefijos usados en el historial: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `perf:`, `deploy:`, con scope opcional (`feat(domain):`, `fix(quality):`).
4. **Solo lectura contra Payments.**
   - Toda query es un `select`: nada de `insert`, `update`, `delete`, RPC que escriba, migraciones ni Edge Functions.
   - Si una view de Postgres ayudaría, escribe el SQL en `sql/proposed_views.sql` para revisión humana. **No se aplica.**
5. **Disciplina de esquema.**
   - Solo columnas listadas en `payments_schema.md`.
   - Cada lectura vive en `src/data/queries/index.ts`, con la lista explícita de columnas de `src/data/queries/columns.ts`. **Nunca `select("*")`.**
   - **Nunca selecciones `clients.ssn_itin_encrypted`.**
   - Aplica además la regla dura de SQL de `NEGOCIO.md`.
6. **Excluir datos de prueba:** `.eq("is_test", false)` en `notes` y `clients`.
7. **Sin secretos en el código.**
   - Variables por `import.meta.env` (navegador) o `dotenv` (scripts). Solo se commitea `.env.example`.
   - Nunca uses la service role key.
   - `vite.config.ts` limita `envPrefix` a `VITE_` y `QUEST_ALLOWED_`, así `QUEST_TEST_EMAIL` y `QUEST_TEST_PASSWORD` nunca llegan al bundle.
8. **Toda la matemática de negocio vive en `src/domain/`**, en TypeScript puro y con tests. ESLint (`no-restricted-imports`) prohíbe importar ahí `react`, `@tanstack/*`, `@supabase/*`, `@/data/*` y `@/components/*`. Las páginas solo renderizan lo que calcula el dominio.
9. **Calidad de datos: nunca ocultar, nunca "corregir".** Las discrepancias entre tablas se muestran en `/quality`; no se parchean en la app.
10. **`npm run build`, `npm run lint` y `npm test` deben pasar.** Son parte de la Definition of Done de `GOAL.md`. Al 2026-09-12 los tres pasan limpios en `v2`.
11. **`npm run deploy` y `npm run check` requieren aprobación explícita de Rodrigo.** `deploy` publica a producción; `check` intenta un `insert` real en Payments.
12. **Los fixtures nunca llevan datos reales de clientes.** Esto incluye `src/domain/__fixtures__/` y cualquier JSON que generen los scripts.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` / `npm ci` | Instala dependencias |
| `npm run dev` | Vite en `http://localhost:5173` (`strictPort`) |
| `npm run build` | `tsc -b` (strict: app, scripts, e2e y tests) y luego `vite build` → `dist/` |
| `npm run preview` | Sirve `dist/` en el puerto 4173 |
| `npm run lint` | ESLint 9 (flat config), incluida la regla de pureza de `src/domain` |
| `npm test` | Vitest (entorno `node`). Tests en `src/**/*.test.ts`: 375 tests en 21 archivos al 2026-09-12 |
| `npm run test:watch` | Vitest en modo watch |
| `npm run e2e` | Playwright headless: hace build, sirve en 4173 y hace login con `QUEST_TEST_EMAIL` / `QUEST_TEST_PASSWORD`. Proyectos desktop (1280×800) y mobile (390×844). Requiere `npx playwright install chromium` |
| `npm run e2e:matrix` | Matriz de dispositivos × orientación (`e2e/mobile-matrix.spec.ts`) |
| `npm run snapshot` | Lee Payments con las queries de la app y llama al RPC de lectura `compute_lot_ledger` por cada finca `fixed_interest`. **Sobrescribe** `src/domain/__fixtures__/payments.json`. Hoy guarda `clients.full_name` reales, lo que viola la regla 12 |
| `npm run check` | **Requiere aprobación de Rodrigo.** Cuenta filas de cada tabla e **intenta un `insert` real en `property_costs`** para probar que RLS lo rechaza. Si el insert llegara a pasar, borra la fila y sale con código 3 |
| `npm run verify:live -- <url>` | Smoke test contra un deploy: gate de acceso, contador del Throne Room y los tres temas. Escribe `docs/live-<tema>.jpg` |
| `npm run deploy` | **Requiere aprobación de Rodrigo.** `npx -y vercel@latest deploy --prod --yes`: **despliega a producción** |
| `npm run screenshots`, `perf`, `qr`, `mobile:audit` | Capturas por tema, métricas en 4G lento, código QR y auditoría móvil (`scripts/`) |

Sobre el entorno:

- Copia `.env.example` a `.env` y llena `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `QUEST_TEST_EMAIL`, `QUEST_TEST_PASSWORD` y `QUEST_ALLOWED_TEST_EMAIL`. Detalle en `README.md` §2 y `DEPLOY.md`.
- El proyecto Supabase es el de Payments (`rruscfrrukagpgymifhq`). No hay base de datos propia.
- `QUEST_ALLOWED_TEST_EMAIL` se incrusta en el bundle al hacer build: si cambia, hay que redesplegar.
- `README.md` pide Node 20+. No hay `.nvmrc`.

## Stack

- **Frontend:** Vite 6, React 18, TypeScript ~5.7 (`strict` y `noUncheckedIndexedAccess`), React Router 6 (`createBrowserRouter`) y TanStack Query 5.
- **UI:** primitivas estilo shadcn sobre Radix (dialog, slider, slot, tooltip), Tailwind 3 con `tailwindcss-animate`, Recharts 2, Framer Motion 11, lucide-react y fuentes self-hosted de `@fontsource`.
- **Datos:** `@supabase/supabase-js` contra Payments, con anon key y RLS.
- **Tests:** Vitest 3 (dominio) y Playwright (e2e).
- **Hosting:** Vercel. `vercel.json` hace rewrite SPA a `/index`, cache inmutable en `/assets` y agrega headers de seguridad.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/main.tsx` | Providers: `ThemeProvider` → `HorizonProvider` → `QueryClientProvider` → `AuthProvider` → `TooltipProvider` → router |
| `src/routes.tsx` | Todas las rutas. Todo, salvo `/login`, va dentro de `RequireAuth` + `AppShell`; las páginas pesadas usan `lazy()` |
| `src/pages/` | Una página por ruta (PascalCase `.tsx`) |
| `src/config/` | `goal.ts` (meta, horizontes, `ERA_START`, fincas legacy), `warplan.ts`, `exodus.ts` |
| `src/data/client.ts` | El único cliente Supabase del navegador |
| `src/data/auth.tsx` | `AuthProvider` / `useAuth`: sesión y gate de acceso |
| `src/data/queries/` | `columns.ts` (columnas explícitas) e `index.ts` (una función de lectura por tabla y `fetchPaymentsSnapshot`) |
| `src/data/useRealm.ts` | Hook de TanStack Query: snapshot → `buildRealm` |
| `src/domain/` | Dominio puro. `realm.ts` (`buildRealm`) orquesta todo; `index.ts` reexporta |
| `src/domain/__tests__/` | Suites de Vitest (con fixture y con `builders.ts` sintéticos) |
| `src/domain/__fixtures__/payments.json` | Snapshot de Payments generado por `npm run snapshot`. **Hoy contiene nombres reales de clientes y viola la regla 12** (pendiente de corregir) |
| `src/components/ui/` | Primitivas estilo shadcn (`button`, `card`, `sheet`, `slider`, `table`, …) |
| `src/components/realm/` | Componentes del juego (`AnimatedCounter`, `PageStates`, `Pulse`, `Liberation`, …) |
| `src/components/layout/` | `AppShell`, `NavDrawer`, `RequireAuth`, `PageTransition` |
| `src/theme/` | `themes.ts`, `tokens.css`, `fonts.css`, `ThemeProvider`, `ThemeMenu`, `icons.ts` |
| `src/horizon/` | Horizonte de salida global (`HorizonProvider`, `horizon.ts` con su test) |
| `src/i18n/` | `lang.ts` (`useLang`) y textos de `/quality` y `/exodus` |
| `src/lib/` | `format.ts` (dinero y fechas), `qualityReview.ts`, `utils.ts` |
| `scripts/` | Scripts `tsx` (snapshot, check, verify-live, screenshots, perf, qr, auditorías móviles) |
| `e2e/` | Playwright: `auth.setup.ts`, `quest.spec.ts`, `mobile-matrix.spec.ts`, `matrix.ts` |
| `sql/proposed_views.sql` | Views propuestas para Payments. **No aplicadas** |
| `docs/` | QR, capturas en vivo y capturas de los polish passes por tema |

## Acceso

Quest no tiene roles propios. La decisión vive en `src/domain/access.ts` y `src/data/auth.tsx`:

- Después del login se lee **solo la fila propia** de `profiles` (`id, role`).
- Entra únicamente `role = 'admin'`, más **una** excepción por e-mail: el questbot `viewer` definido en `QUEST_ALLOWED_TEST_EMAIL`, que usan e2e y `verify:live`.
- Cualquier otro rol, una fila faltante o un error al leer el perfil → *"Quest is for the TerraFunded team only."* y `signOut({ scope: "local" })`. El gate falla cerrado.
- `useRealm` no consulta nada hasta que el acceso es `granted`. Los datos los protege la RLS de Payments.

## Datos

- **Una sola carga:** `useRealm` trae las nueve tablas en paralelo (`farm_acquisitions`, `properties`, `file_cases`, `notes`, `note_sales`, `investor_distributions`, `property_costs`, `investors`, `clients`), con `staleTime` de 5 min y `REALM_QUERY_KEY`.
- **El horizonte no va en el query key:** se aplica en un `useMemo` para que cambiar de año no vuelva a consultar.
- **Errores por tabla:** si una tabla falla, el error se junta en `tableErrors` y se muestra con `TableErrorsBanner`; el resto sigue funcionando.
- **Límite de filas:** `MAX_ROWS = 5000` en cada query, para que el tope silencioso de 1000 filas nunca trunque una tabla.
- **RPC:** `compute_lot_ledger(p_farm_id, p_as_of)` solo se llama desde `scripts/snapshot.ts`. Sus columnas reales están en `payments_schema.md` (versión de `v2`).
- **Cuando los datos de Payments se mueven:** los tests con fixture y el e2e fijan cifras reales (por ejemplo `VERIFIED_LEDGER_TOTAL = "$8,984,992.30"` y 121 lotes en `e2e/quest.spec.ts`). El patrón del historial es correr `npm run snapshot`, volver a fijar las cifras y documentar cada número que cambió en `PROGRESS.md`.

## Convenciones de código

**Estilo**
- Comillas dobles y punto y coma. No hay Prettier ni `.editorconfig`.
- Imports con alias `@/` entre capas (páginas, componentes, `data`, `i18n`). **Dentro de `src/domain/` los imports son relativos.**
- Comentarios JSDoc que explican el porqué y la regla de negocio, sobre todo en `src/domain/` y `src/config/`.

**Datos y dominio**
- Las páginas nunca importan el cliente Supabase ni las queries: usan `useRealm()` y leen del `Realm`.
- **Fechas:** usa los helpers de `src/domain/dates.ts` (`parseDate`, `daysBetween`, `monthKey`, …). Todo se normaliza a medianoche UTC, y `src/lib/format.ts` formatea con `timeZone: "UTC"`.
- **Dinero:** `money`, `moneyExact` y `moneyCompact` de `src/lib/format.ts`.

**Páginas**
- Estados de carga, vacío y error con `PageHeader`, `LoadingState`, `EmptyState`, `ErrorState` y `TableErrorsBanner` de `src/components/realm/PageStates.tsx`.
- Los e2e seleccionan por `data-testid` (`net-profit-counter`, `pipeline-trapped`, …). No los renombres sin actualizar `e2e/`.
- `localStorage` usa claves con prefijo `quest.`: `quest.theme`, `quest.lang`, `quest.lastVisit`, `quest.intro.seen`, `quest.celebrated`, `quest.liberations.seen`, `quest.quality.review`, `quest.warplan.scenarios`, `quest.exodus.scenarios` y `quest.v2.exitHorizon`.

**Idioma**
- La UI está en inglés.
- Solo `/quality` y `/exodus` siguen `quest.lang` (default `es`). Sus textos están en `src/i18n/quality.ts` y `src/i18n/exodus.ts`; las lecturas de cada issue, en `src/domain/quality_human.ts`. No hay un sistema i18n general.

**Tests y documentación**
- Cada módulo nuevo de `src/domain/` lleva tests en `src/domain/__tests__/`.
- El agente mantiene `PROGRESS.md` (qué está hecho y con qué evidencia) y `OPEN_QUESTIONS.md` (supuestos numerados `## N. Título`) al día después de cada paso grande.

## Sistema de diseño

Hay tres skins con los mismos datos y los mismos layouts; solo cambian tokens, tipografía, textura, movimiento e íconos (`README.md` §9):

| Skin | Id |
|---|---|
| **Iron Crown** (default) | `iron-crown` |
| **Gilded Realm** | `gilded-realm` |
| **Neon Kingdom** | `neon-kingdom` |

- **Tokens:** cada color, radio, fuente, glow y escala de movimiento es una variable CSS en `src/theme/tokens.css`, dentro de un bloque `[data-theme="…"]`. Tailwind las lee como `hsl(var(--x) / <alpha-value>)`.
- **Colores:** usa los tokens semánticos (`gold`, `ember`, `siege`, `oxygen`, `liberty`, `sponsor`, `steel`, `arcane`, `stage.*`). Hoy no hay clases de paleta cruda (`bg-gray-500`, …) en páginas ni componentes: nada en `src/pages` ni en `src/components` debe saber qué skin está activo.
- **Tipografía:** `font-display`, `font-heading`, `font-body` y `font-numeric`. `text-sm` y `text-xs` están redefinidos a 15px como piso de texto.
- **Movimiento:** `MotionConfig` con `reducedMotion="user"`. Las partículas no se renderizan con `prefers-reduced-motion`.
- **Móvil** (`MOBILE_LOG.md`): sin scroll horizontal, `100dvh`, targets táctiles ≥ 44px, texto ≥ 15px e inputs ≥ 16px.

## Errores conocidos de este repo

- **El fixture tiene datos reales de clientes.** `src/domain/__fixtures__/payments.json` guarda `clients.full_name` reales, en contra de la regla 12. Está pendiente de corregir; no lo cambies sin que Rodrigo lo pida.
- **Conteos viejos en el README.** `README.md` dice 162 unit tests; al 2026-09-12 hay 375. Confía en la salida de `npm test`, no en las cifras escritas.
- **Cifras fijadas vs datos vivos.** Si un test de fixture o el e2e falla por un monto, primero revisa si Payments cambió (ya pasó: Titus Lot 6 se re-precificó, se agregó Lakeview y se agregaron surveys). No es necesariamente un bug.
- **File cases cancelados invisibles.** El rol `viewer` solo ve file cases `active` y `completed`, así que las métricas de cancelación podrían estar calculadas sobre un conjunto filtrado por RLS (`AUDIT.md` F14 y OPEN_QUESTIONS #119, en el PR #3).
- **`profiles` es legible completo para el viewer** bajo la RLS actual, aunque Quest solo lee su fila (OPEN_QUESTIONS #97).
- **El camino `admin` nunca se probó con un login real.** Solo está cubierto por tests, porque no hay credenciales admin (OPEN_QUESTIONS #98).
- **`information_schema` no está expuesto** por PostgREST con las credenciales de la app (`AUDIT.md` §1.1). La referencia de columnas es `payments_schema.md`.
- **PRs abiertos contra `v2`:** #3 (auditoría numérica), #4 (F1: trofeo *Debt of Honor* mezclaba capital propio), #5 (F2: Quality comparaba contra `notes[0]`) y #6 (e2e flaky de Pulse). El #2 (exit horizon) es draft contra `main`.
- **Discrepancias abiertas con `NEGOCIO.md`,** sin resolver en el código:
  - `NEGOCIO.md` dice que Quest es la verdad del inventario de lotes, parcelas e inversionistas; v2 lee todo eso de tablas de Payments.
  - `NEGOCIO.md` dice que el interés al inversionista se detiene ~3 meses después de la venta o reserva. `src/domain/interest.ts` lo devenga hasta que llegan distribuciones `capital_return`, y `lotLedger.ts` hasta el día de liberación del lote.

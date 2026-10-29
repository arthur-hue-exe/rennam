# Rennam Torado

Jogo de plataforma em pixel art inspirado no Super Mario World, com um contador global compartilhado. Cada toque em **TORAR!** faz o personagem pular e cabecear o bloco `?`; o ponto só aparece depois que o banco confirma o clique.

- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Arte:** sprites 16-bit gerados por código em `public/sprites/`
- **Fonte:** Press Start 2P auto-hospedada em `src/app/fonts/`
- **Backend:** Supabase local (Postgres + PostgREST + Realtime)
- **Contador:** `NUMERIC(18,0)`, transportado como string decimal, com RPC atômica e RLS

## Rodando localmente

Pré-requisitos: Node.js 20+, Docker Desktop e a CLI do Supabase (instalada como dependência do projeto).

```bash
npm install
npm run db:start          # sobe o Supabase local (API 54321, Studio 54323)
cp .env.example .env.local # preencha com a URL e a anon key de `npx supabase status`
npm run db:reset          # banco local limpo + todas as migrations
npm run dev               # http://localhost:3000
```

`.env.local` precisa de:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key do `npx supabase status`>
```

Para produção local:

```bash
npm run build
npm start
```

> `npm run db:reset` apaga e recria o banco **local**. Nunca use esse comando em um projeto Supabase de produção.

## Contador global

A migration [supabase/migrations/20261029170000_rennam_counter.sql](supabase/migrations/20261029170000_rennam_counter.sql) cria:

| Objeto | Papel |
| --- | --- |
| `public.rennam_counter` | Uma única linha (`id = 1`) com `value NUMERIC(18,0)` e `revision bigint` |
| `public.rennam_clicks` | IDs UUID dos cliques já confirmados (idempotência) |
| `public.rennam_contador()` | Leitura autenticada que devolve `value` e `revision` como texto |
| `public.rennam_torar(uuid)` | RPC transacional que valida, registra e incrementa o contador |

Garantias implementadas:

- O valor oficial **nunca** fica no `localStorage`; ele existe apenas no Postgres. O navegador guarda somente a preferência de som.
- `rennam_torar` insere o UUID do clique com `ON CONFLICT DO NOTHING`. Um retry com o mesmo UUID devolve o valor atual sem contar de novo.
- O incremento é um único `UPDATE ... RETURNING`, portanto o PostgreSQL serializa cliques concorrentes e nenhum se perde.
- A função é `SECURITY DEFINER`, com `search_path` vazio; `anon` e `authenticated` só podem **executar** as RPCs.
- As tabelas têm RLS habilitada. Visitantes só têm `SELECT` em `rennam_counter`; não há policy de escrita e os privilégios diretos de `INSERT`/`UPDATE`/`DELETE` são revogados.
- `value` é `NUMERIC(18,0)`. O JSON devolve `"value": "123"` (string) para o frontend nunca passar por `Number`.
- O limite é `999999999999999999`. Chegar nele **não** zera o placar; somente o clique seguinte volta para `0`.
- A inicialização usa `INSERT ... ON CONFLICT DO NOTHING`: o zero só é criado quando a linha ainda não existe.
- `rennam_counter` está na publicação `supabase_realtime`, então outros navegadores recebem a mudança sem recarregar.

No cliente, `useSharedCounter` aplica snapshots apenas quando a `revision` é maior que a última vista, evita contar duas vezes ao repetir UUIDs falhos, escuta Realtime (com debounce) e usa polling de 20 s, foco e `online` como reforço.

## Configuração manual do Supabase em nuvem

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Aplique a migration:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Ou cole o SQL da migration no SQL Editor. A migration é idempotente e não sobrescreve um valor existente.
3. Em **Project Settings → API**, copie a URL e a **anon/publishable key** para as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do deploy.
4. Confirme em **Database → Replication** que `rennam_counter` está na publicação `supabase_realtime`. Se o projeto já tinha essa publicação, a migration só adiciona a tabela.
5. Não coloque a `service_role` no cliente. O site usa apenas a anon key e as RPCs.
6. Opcional: depois do deploy, faça um clique real, recarregue a página e abra uma segunda aba para validar persistência e Realtime.

## Testes

```bash
npm run lint
npm run typecheck
npm run test:counter        # banco: atomicidade, RLS, idempotência e concorrência
```

Testes de navegador exigem o app rodando em `http://localhost:3000` e um Chrome com CDP na porta 9222:

```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir="%TEMP%\rennam-cdp" --window-size=1440,900 http://localhost:3000
npm run test:ui             # interação, colisão, teclado, retry, Realtime, reload e som
npm run test:layout         # 1440x900, 1280x720, 820x1180, 390x844, 320x568 e 844x390
npm run test:celebration    # marcos 100/500, teto de 18 dígitos e virada para zero
```

Os testes de navegador usam o Supabase local e **alteram** o contador. Para deixá-lo em zero após os testes:

```bash
docker exec supabase_db_Rennam psql -U postgres -d postgres -c \
  "truncate public.rennam_clicks; update public.rennam_counter set value = 0, revision = revision + 1 where id = 1;"
```

O `test:celebration` usa o container `supabase_db_Rennam` para preparar valores de teste e termina zerando o placar.

Resultados obtidos nesta entrega:

- **6/6** verificações de banco: transporte decimal, UUID nulo rejeitado, escrita direta bloqueada (401), 50 incrementos paralelos sem perda, retry idempotente e leituras consistentes.
- **10/10** verificações de UI no build de produção: estado inicial, colisão de pulo, clique, teclado, falha com aviso, retry sem contagem dupla, Realtime em segunda aba, persistência após reload, mudo persistente e console limpo.
- **6/6** layouts sem overflow e com o botão abaixo do personagem.
- **5/5** celebrações/limite: banners de 100 e 500, máximo de 18 dígitos sem zerar antes da hora, virada para zero no clique seguinte e coluna `numeric(18,0)`.

Capturas de evidência em `scripts/`: `ui-100.png`, `ui-500.png`, `ui-max.png`, `ui-wrap.png` e as telas de layout.

## Estrutura

```text
src/
  app/                 layout, página, estilos globais, fonte e ícone
  components/game/     cena, jogador, bloco, botão, placar, banners e partículas
  hooks/               contador compartilhado, som e preferência de movimento reduzido
  lib/                 cliente Supabase, áudio sintetizado, formatação e marcos
supabase/
  config.toml
  migrations/20261029170000_rennam_counter.sql
public/sprites/        sprites e tiles gerados
scripts/               gerador de sprites e testes de integração
```

## Acessibilidade e desempenho

- Botões nativos, foco visível, `aria-live` no placar, `role="alert"` nos avisos e rótulos de som/mudo.
- Espaço e Enter acionam o TORAR! quando o foco não está em um controle interativo.
- `prefers-reduced-motion` desliga animações decorativas; as partículas respeitam a preferência.
- Sprites com `image-rendering: pixelated`, sem bibliotecas de animação ou áudio externas.
- Partículas em canvas com DPR, limite de 500 e `requestAnimationFrame` apenas enquanto existem partículas.

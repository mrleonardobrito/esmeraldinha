# Design do sistema

Guia do design do produto, escrito a partir do que já existe em `src/`. Serve
para manter novas telas coerentes com as atuais (`/professores`, `/cadernetas`).

## Fundação

- **Stack visual**: Tailwind CSS v4 via `@tailwindcss/vite`, sem
  `tailwind.config`. Todo o tema vive em [src/globals.css](src/globals.css)
  (`@theme inline` + variáveis CSS).
- **Componentes**: shadcn/ui em [src/components/ui/](src/components/ui/), estilo
  `radix-rhea`, base color `mist`, `cssVariables: true`, `rsc: false`
  ([components.json](components.json)).
- **Ícones**: `@tabler/icons-react` (`iconLibrary: "tabler"`). Não misture
  outras bibliotecas de ícones.

## Cor

Paleta esmeralda sobre neutros frios, toda em `oklch`. Nunca escreva cor
literal em componente — use os tokens.

| Papel | Token | Uso |
| --- | --- | --- |
| Marca / ação primária | `primary`, `primary-foreground` | botões principais, estado selecionado |
| Destaque | `accent` (= mesmo verde do primary) | realces pontuais |
| Superfície | `background`, `card`, `popover` | fundo da app e dos cartões |
| Texto | `foreground`, `muted-foreground` | texto e texto secundário |
| Neutro de apoio | `muted`, `secondary` | fundos discretos, hover |
| Contorno | `border`, `input`, `ring` | bordas, campos e foco |
| Erro | `destructive` | avisos e ações destrutivas |
| Gráficos | `chart-1`…`chart-5` | rampa esmeralda do claro ao escuro |
| Barra lateral | `sidebar*` | tokens próprios da sidebar |

Regras práticas:

- O verde (`--primary: oklch(0.508 0.118 165.612)`) escurece no dark
  (`oklch(0.432 …)`); o par `*-foreground` já garante contraste — use sempre os
  dois juntos.
- Estados de erro compõem sobre o token: `border-destructive/30`,
  `bg-destructive/10`, `text-destructive`.
- Foco é sempre visível: `focus-visible:border-ring` +
  `focus-visible:ring-3 focus-visible:ring-ring/30`. A base já aplica
  `outline-ring/50` em tudo.
- O fundo da área de conteúdo é `bg-zinc-50 dark:bg-black` (fora dos tokens, de
  propósito: cria o degrau de profundidade sob os cards `bg-card`).

## Tipografia

Fontes carregadas por `<link>` no [index.html](index.html) — nunca `next/font`.

- `--font-sans`: **DM Sans** — texto de interface, padrão via `html { font-sans }`.
- `--font-heading`: **Nunito Sans** — títulos, aplicada com `font-heading`.
- `--font-mono`: **Geist Mono** — dados técnicos.

Escala em uso: título de página `font-heading text-lg font-medium`; corpo e
tabelas `text-sm`; apoio `text-sm text-muted-foreground`. `antialiased` é global
no `<html>`.

## Forma e espaçamento

- Raio base `--radius: 0.625rem`, com a escala derivada `--radius-sm` →
  `--radius-4xl` (múltiplos de 0.6 a 2.6). Blocos grandes (empty states, cards
  clicáveis) usam `rounded-2xl`.
- Espaçamento por `gap`, não por margens: `gap-1` (rótulo+valor), `gap-2`
  (ícone+texto, linha de controles), `gap-3`/`gap-4` (blocos de uma seção).
- Padding da área de conteúdo: `p-4 lg:p-6`.
- Grades responsivas partem de 1 coluna:
  `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.

## Layout da aplicação

```
SidebarProvider
├── AppSidebar        (collapsible="offcanvas": logo, NavMain, NavUser)
└── main  flex-1 flex-col
    ├── SiteHeader    (h-12, border-b, SidebarTrigger + ModeToggle)
    └── <rota>        div.min-w-full.flex-1.bg-zinc-50.p-4.lg:p-6.dark:bg-black
```

Toda página repete esse wrapper de conteúdo (em `cadernetas.tsx` ele está
extraído como `Shell`). Providers globais: `ThemeProvider`, `BrowserRouter`,
`SidebarProvider`, `TooltipProvider` e o `<Toaster />` do sonner.

## Padrões de tela

- **Página = um `Card`**: `CardHeader` com `CardTitle` + `CardDescription`, e a
  ação primária em `CardAction` (canto superior direito). O conteúdo vai em
  `CardContent`.
- **Empty state**: bloco centralizado
  `flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center`,
  com ícone `size-8 text-muted-foreground`, título `text-sm font-medium`,
  explicação em `text-muted-foreground` e um botão `variant="outline"` que leva
  ao próximo passo.
- **Listas tabulares**: `Table` do shadcn; a coluna de ações é
  `<TableHead className="w-10" />` com um `DropdownMenu` de trigger icônico.
- **Seleção visual**: cartões-botão (`ProfessorPicker`) com `aria-pressed` e o
  estado ativo em `border-primary ring-3 ring-primary/20`.
- **Formulários**: abrem em `Sheet` lateral
  (`SheetContent className="gap-0 overflow-y-auto"`), com corpo
  `flex flex-col gap-4 px-6` e `SheetFooter` para as ações.
- **Status**: `Badge variant="outline" className="h-8 gap-1.5 px-3"` com ícone;
  carregando usa `IconLoader className="animate-spin"`.
- **Feedback**: `toast` do sonner para o resultado de ações (sucesso e erro);
  erros persistentes ficam num bloco `destructive` dentro da própria tela.

## Ícones e acessibilidade

- Ícone dentro de botão com texto usa `data-icon="inline-start"` (ou
  `inline-end`); o espaçamento vem do próprio `Button`.
- Botão só com ícone precisa de `aria-label` descritivo (ex.:
  `aria-label={\`Ações de ${professor.nome}\`}`) ou de um `<span className="sr-only">`.
- Separadores decorativos levam `aria-hidden="true"`.
- `lang="pt-BR"` no `<html>`: todo texto visível é em português, mesmo com o
  código em inglês.

## Ao criar uma tela nova

1. Envolva no wrapper de conteúdo (`p-4 lg:p-6`, fundo `zinc-50`/`black`).
2. Comece por um `Card` com título, descrição e ação primária no `CardAction`.
3. Preveja o estado vazio, o carregando e o erro — os três já têm padrão acima.
4. Use apenas tokens de cor e componentes de `@/components/ui`; se faltar um,
   adicione via shadcn em vez de escrever CSS solto.
5. Verifique nos dois temas antes de fechar.

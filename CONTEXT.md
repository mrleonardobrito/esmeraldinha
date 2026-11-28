# Context: Esmeraldinha

Esmeraldinha is an operational and pedagogical assistance application for the cadernetas of Limoeiro de Anadia. The portal do professor is the official system and the only place where a caderneta has legal validity. The application organizes, automates and assists the work of both the auxiliar de ensino and the professor, with security, traceability and human review.

Business source: [Esmeraldinha — Funcionamento do Negócio e Regras Operacionais (v2)](https://docs.google.com/document/d/1Uh3mdCZv9Hao_g8_5AJusjtZJLtlKK-d), sections 1–5. This context describes product requirements, not proof that every feature is already implemented.

Domain terms remain Portuguese in prose, code identifiers and filenames; surrounding technical prose is English. Portal labels are recorded for integration. English names in a new infrastructure schema are mapped at the boundary, not adopted as core vocabulary.

## Pessoas, acesso e segurança

**auxiliar de ensino**:
The person responsible for centralized management at the escola. Registers professores, manages their credenciais and fills cadernetas on their behalf within the auxiliary's management scope. Can grant or suspend direct application access for a professor under that scope.
_Avoid_: assistant, operador, admin

**professor**:
The owner of a caderneta. May have an auxiliar de ensino fill it on their behalf or purchase direct access to Esmeraldinha and independently view, fill and manage only their own cadernetas. The specified direct login uses the same CPF and senha as the portal.
_Avoid_: teacher, docente

**papel de acesso**:
The authorization category of an authenticated person: auxiliar de ensino or professor. Defines which actions and resources the person can reach. A professor's resources are scoped to that professor; an auxiliary's resources are scoped to their management. A papel de acesso is not a paid entitlement.
_Avoid_: role, permission (in core domain vocabulary)

**plano**:
The paid modality through which a professor contracts direct access to Esmeraldinha. Does not change the papel de acesso or broaden resource ownership. Pricing, billing, renewals, expiration and plan tiers are not specified in the v2 requirements.

**acesso direto do professor**:
The ability of a professor to enter Esmeraldinha and manage their own cadernetas, rather than relying only on the auxiliar de ensino. The current migration direction allows the auxiliary to grant, suspend and restore access. A cadastro alone does not imply access. The commercial entitlement and the operational grant are distinct concepts; their exact commercial lifecycle is not specified.
_Avoid_: treating cadastro, plano and papel de acesso as equivalent

**conta do auxiliar de ensino**:
The account used by the auxiliar de ensino to enter Esmeraldinha, with login, senha, nome, e-mail and foto. The present installation has a single management account; that deployment assumption is not a general business rule.
_Avoid_: perfil (when referring to the entire conta)

**senha temporária**:
The initial local conta senha, defined in the environment. Must be replaced by a senha definitiva before the rest of the application becomes accessible. Store the definitive password as a password hash, not plaintext.
_Avoid_: senha padrão (after primeiro acesso)

**primeiro acesso**:
The mandatory troca of the senha temporária for a senha definitiva. While the temporary senha is active, no other application screen opens.
_Avoid_: treating this as optional onboarding

**sessão do auxiliar**:
Proof that the auxiliar de ensino has authenticated in Esmeraldinha. Expires after inactivity. Distinct from the sessão do portal.
_Avoid_: login, sessão do portal

**sessão da aplicação**:
The authenticated Esmeraldinha session of an auxiliar de ensino or professor. Its access must follow the current papel de acesso and access status. This is distinct from an external provider token and from a sessão do portal. Live revocation is a security requirement of the migration.

**credenciais do professor**:
Nome, login (CPF), senha and escola used to authenticate in the portal. The auxiliar de ensino uses them to act on behalf of the professor, because the portal does not offer delegated access (existing domain constraint). Keep these sensitive data separate from application identity and protect them at rest; never treat them as a general-purpose application credential store.
_Avoid_: equating portal credentials with provider credentials

## Portal e integração

**portal**:
The portal do professor of Limoeiro de Anadia. Official and legally authoritative system for cadernetas. When portal data conflicts with local proposals or cached values, the portal prevails.
_Avoid_: treating a local snapshot as a legally valid caderneta

**escola**:
The school used in the professor's portal login. Part of the credenciais do professor.
_Avoid_: organization or workspace (not equivalent)

**sessão do portal**:
An authenticated portal session opened with the credenciais of a professor. Expires after inactivity. Selects the appropriate período letivo before reading or writing; distinct from the sessão da aplicação.

**período letivo**:
The portal partition selected in _Configurações de ambiente_, e.g. `2026` for regular turmas or `2026 EJA` for Educação de Jovens e Adultos. Each has its own etapas and turmas. A professor can work in multiple períodos letivos; preserve the período letivo where each turma was discovered.
_Avoid_: calendário acadêmico, ano letivo, ambiente (as interchangeable terms)

## Estrutura das cadernetas

**caderneta**:
The record a professor keeps over the school year, composed of conteúdo, frequência, ficha de desempenho, ficha descritiva and boletim. Covers one turma where that professor is regente or one to four turmas de redução for the same professor. Completion requires all mandatory information for the aulas and estudantes of every included turma throughout the four etapas, according to each parte's granularity.
_Avoid_: diário, registro, notebook

**turma**:
Discovered automatically from the portal during professor cadastro, never entered manually. Has its own estudantes, aulas and período letivo. These associations remain distinct even when several turmas share a caderneta.
_Avoid_: class, grupo

**regente**:
A professor's relationship with a turma identified by the portal's grupo diário, e.g. `REGENTE MANHÃ`. Generates an exclusive caderneta for that turma. Not a global attribute of the professor or a papel de acesso.

**turma de redução**:
A turma whose grupo diário starts with `REDUÇÃO` for a specific professor. One to four such turmas belonging to the same professor are automatically grouped into a caderneta, including existing cadernetas during updates. Preserve existing groups where possible and fill available slots in stable cadastro order, maximum four. Never merge the underlying aulas or estudantes.
_Avoid_: turma reduzida

**grupo diário**:
Portal field identifying the professor–turma relationship. Examples: `REGENTE MANHÃ`, `REDUÇÃO MANHÃ`, `REDUÇÃO TARDE`, `REDUÇÃO NOITE`, `REDUÇÃO VITORIA`. A value beginning with REDUÇÃO identifies a turma de redução. An unread or ambiguous value must not be assumed to identify a relationship (existing integration safeguard).
_Avoid_: turno, redução (as the name of the field)

**redução**:
The designation extracted from grupo diário for that professor. Its suffix may be a turno or a name; it is independent of the turno extracted from the turma name.

**nome curto da turma**:
Display-only central identifier extracted from the full portal name, e.g. `PRÉ-ESCOLA II - C` from `PRÉ-ESCOLA II - PRÉ-ESCOLA II - C - INTEGRAL`. Keep the full name as the integration key.
_Avoid_: replacing the stored portal name

**turno**:
`MATUTINO`, `VESPERTINO` or `INTEGRAL`, extracted from the end of the turma name.

**etapa**:
One of four divisions of the school year, with start/end dates defined by the calendário acadêmico.
_Avoid_: bimestre, período letivo

**calendário acadêmico**:
The academic calendar that determines the start and end of each etapa.

**mês**:
A subdivision used to filter the display within an etapa. Has no independent completeness criterion.

**aula**:
A dated lesson in a turma, the basic unit of progress of a caderneta.
_Avoid_: dia (several aulas can share one date)

**estudante**:
A student enrolled in a turma, named as such by the portal.
_Avoid_: aluno, student

**matrícula**:
An estudante's enrollment in a turma, carrying an identifier, situação (e.g. ATIVO) and data da matrícula. Boletim matching uses matrícula, never the estudante's name alone.

## As cinco partes da caderneta

| Parte | Portal screen | Scope |
| --- | --- | --- |
| conteúdo | Lançamento de Conteúdo | Each aula, respecting its ordem da aula |
| frequência | Lançamento de Presença | Each estudante in each dated aula of the turma |
| ficha de desempenho | Ficha Desempenho | Each estudante, área de conhecimento, habilidade and etapa |
| ficha descritiva | Ficha Descritiva / Monitoramento | Individual descriptive follow-up for each estudante over the etapa |
| boletim | Resultado de Avaliação | Each estudante's notas by etapa, disciplina and avaliação |

**conteúdo**:
What was taught in an aula. Contains código CR, desenvolvimento, ferramentas, recuperação and interação; respects the ordem da aula.

**ordem da aula**:
The aula's position within a dia.

**código CR**:
Curriculum reference recorded for an aula.

**desenvolvimento**:
Narrative of what was taught and how. Portal label: _Desenvolvimento / Metodologia_.
_Avoid_: metodologia (as the canonical domain name)

**ferramentas**:
Resources used in an aula. Portal label: _Ferramentas Utilizadas_.

**recuperação**:
The recuperação marking for an aula.

**interação**:
The interação marking for an aula.

**frequência**:
The presença record of each estudante matriculado in each aula. Canonical domain term is frequência; the portal screen says Presença.

**ficha de desempenho**:
The evaluation of each estudante across the áreas de conhecimento and their habilidades, organized by etapa.

**ficha descritiva**:
The individual descriptive acompanhamento of an estudante throughout an etapa.

**boletim**:
The grid of notas for a turma, etapa and disciplina. Requires the corresponding avaliações to exist on the portal before lançamento.

## Ficha de desempenho

**área de conhecimento**:
Group of habilidades determined by the série: curricular components, Sócio-afetivos or campos de experiência in Educação Infantil, as applicable. Read from the portal, never assume a fixed list. Both the auxiliar de ensino and the professor can select áreas for batch filling for all estudantes of the authorized turma.
_Avoid_: disciplina (the concepts are not interchangeable)

**habilidade**:
An evaluation item within an área de conhecimento; portal label _Descritores_.

**conceito**:
The result for a habilidade of an estudante in an etapa: NR (não realiza), RD (realiza com dificuldades) or R (realiza). Ordered NR < RD < R. A conceito must never decrease from one etapa to the next.
_Avoid_: nota, classificação

**observação**:
Information on an estudante's desempenho, submitted by the professor to the auxiliar de ensino or directly in Esmeraldinha, as text, image or PDF. An estudante not mentioned with difficulties receives R in every habilidade of the selected áreas. The non-regression rule always applies.

## Boletim, avaliações e classificação

**avaliação**:
An item against which notas are recorded, with nome, tipo, data and valor. Must already be registered for the etapa in _Cadastro de Avaliação_ before filling the boletim. Existing portal examples of tipo: OBSERVAÇÃO, TRABALHO EM GRUPO, AVALIAÇÃO/PROVA.

**disciplina**:
Subject of a turma with its own boletim for an etapa.
_Avoid_: área de conhecimento (when referring to the boletim)

**nota**:
An estudante's value for an avaliação. Keyed within the turma and etapa by matrícula, disciplina and avaliação, never by name alone.

**nota personalizada**:
An editable value on an estudante's boletim row, outside an individual avaliação.

**nota parcial**:
Read-only value calculated by the portal. Esmeraldinha reads but never writes it.

**nota calculada pelas avaliações**:
Read-only value calculated by the portal from avaliações. Esmeraldinha reads but never writes it.

**nota final da etapa**:
Editable value closing the estudante's etapa.

**classificação**:
The estudante's classification band. On the 10-point scale:

| Classificação | Nota final | Generated target |
| --- | --- | --- |
| Acima da média | 8 to 10 | 10 |
| Na média | 6 to less than 8 | 7 |
| Abaixo da média | Less than 6 | 5 |

Scale proportionally when the sum of avaliação values differs from 10. Distribute the generated target across avaliações in increments of 0.5. Remember exceptions to classificação padrão across later etapas and disciplinas for the estudante of that turma. Portal values prevail when they disagree.
_Avoid_: conceito, nível

**classificação padrão**:
Default classification for estudantes without portal notas or a remembered exception. Initially Acima da média, so an empty boletim starts at 10 on the standard scale.

Existing behavior refinement retained from the previous context: editing the nota final or an avaliação recomputes the classification band; estudantes matching the padrão keep following it. Confirm this against implementation tests before changing behavior; v2 does not detail the recalculation mechanics.

## Assistentes conversacionais e revisão humana

Both chats are available to the auxiliar de ensino acting within management scope and to the professor acting on their own cadernetas. They assist with proposals; neither writes to the portal directly.

**chat de conteúdos**:
Conversation opened from _Lançar Conteúdo_ to draft conteúdo for aulas still empty within the escopo da conversa. Reads conversation, anexos, aulas already present in the portal and selected aulas de referência. Generates a rascunho de conteúdo per aula.
_Avoid_: autonomous portal writing

**escopo da conversa**:
One specific mês or an entire etapa. Generate rascunhos only for empty aulas within that scope.

**aula de referência**:
An aula with existing conteúdo selected by the auxiliar de ensino or professor as a model for writing style and didactic sequence. Existing aulas within the scope also provide context.

**rascunho de conteúdo**:
Proposed código CR, desenvolvimento and ferramentas for one aula, retained on screen for review. Not confirmed portal data.

**preenchimento assistido**:
Preparation of selected rascunhos in separate portal tabs for each mês. The authorized operator reviews and saves them in the portal. Preparation alone is not a confirmed write.

**verificação**:
After human review and saving, read the portal using a fresh sessão do portal to confirm the saved conteúdo. Remove only rascunhos for verified aulas; keep pending rascunhos on screen.

**chat de notas**:
Conversation opened from _Lançar Notas_ for one etapa and disciplina. The auxiliar de ensino or professor provides natural-language instructions, e.g. “a turma foi acima da média, menos o estudante X”. The agent proposes only notas finais da etapa. Apply the same classificação and deterministic distribution rules as the boletim grid. Nothing is sent directly to the portal before the operator checks it.

**anexos**:
Supporting inputs supplied by the professor or auxiliar de ensino in the applicable workflow, including text, images and PDF where supported. Keep them scoped to the authorized caderneta; do not infer that every file format is supported by every screen.

## Requirements versus architecture decisions

The current business document specifies portal CPF/senha login and local mandatory primeiro acesso. The small-installation [authentication migration guide](docs/architecture/authentication-migration.md) proposes independent application credentials through verified email enrollment in remote mode; this is not yet a business requirement and does not supersede the specified login. The core owns authorization and internal identity irrespective of the provider. Implementation and deployment details belong to architecture documentation.

The current product has four users and one management installation. Do not read future organizations, subscriptions infrastructure or multi-tenant deployment as already implemented requirements. The paid plano is a business concept; its exact payment and entitlement lifecycle still needs specification. No additional pedagogical rules or provider-specific workflows should be inferred from this glossary.

# Context: Esmeraldinha

Esmeraldinha fills in cadernetas on the portal do professor of Limoeiro de Anadia on behalf of professores, driven by the auxiliar de ensino.

Domain terms are Portuguese and are never translated — in prose, in code identifiers, or in filenames. Everything around them is English. Where the portal shows a different label for a term, the label is recorded so an agent reading the screen can map the two.

## Language

### Pessoas

**auxiliar de ensino**:
The person who fills in cadernetas on behalf of professores and manages their access to Esmeraldinha.
_Avoid_: assistant, operador, usuário, admin

**papel de acesso**:
The identity that determines what a signed-in person can reach. An **auxiliar de ensino** can manage professores and every caderneta; a **professor** can only view and fill in their own cadernetas. The role is an authorization boundary, not a freemium entitlement.
_Avoid_: role, permission

**conta do auxiliar de ensino**:
The single account the auxiliar de ensino signs into Esmeraldinha with. Carries a login, a senha, and the perfil (nome, e-mail, foto). It exists because the app holds the credenciais do professor: only whoever knows the senha gets to them.
_Avoid_: conta de usuário, account, perfil

**senha temporária**:
The senha the conta do auxiliar de ensino is born with, read from the environment and identical in every install. It only survives the primeiro acesso: nothing else in the app opens until it is replaced by a senha definitiva, kept as a hash.
_Avoid_: senha padrão, temporary password

**primeiro acesso**:
The first entry into Esmeraldinha, where the senha temporária is exchanged for the senha definitiva. The only screen a conta with a senha temporária can reach.
_Avoid_: onboarding, first login

**sessão do auxiliar**:
The proof that whoever is at the keyboard has signed into the conta do auxiliar de ensino, expiring after an idle period. Not to be confused with a sessão do portal, which is a browser opened with the credenciais of one professor.
_Avoid_: login, sessão de usuário

**professor**:
The teacher a caderneta belongs to. They can enter Esmeraldinha with the same CPF and senha used in the portal, and can only access their own cadernetas.
_Avoid_: teacher, docente

**credenciais do professor**:
The login (a CPF), senha and escola a professor hands over so the auxiliar de ensino can act as them on the portal. Esmeraldinha stores these by necessity: the portal has no delegated access.
_Avoid_: credentials, account

### Portal

**portal**:
The portal do professor of Limoeiro de Anadia. The external system Esmeraldinha writes into, and the only place a caderneta legally exists.
_Avoid_: site, sistema externo

**escola**:
The school a professor logs into the portal under. Part of the credenciais do professor, alongside login and senha.
_Avoid_: school, unidade

**sessão do portal**:
An authenticated session on the portal, opened with the credenciais do professor and expiring after an idle period.
_Avoid_: session, login

### Estrutura

**caderneta**:
The record a professor must keep across the school year. It covers one turma
where the professor is regente, or one to four turmas de redução for that
professor. Turmas de redução are grouped automatically, including existing
cadernetas; grouping is not an optional cadastro setting. Composed of the five
partes below, and finished only once the
required information is filled in for every aula and estudante of every
included turma across all four etapas.
_Avoid_: diário, registro, notebook

**turma**:
A class group. Discovered on the portal during the cadastro do professor, never
typed: the portal is what knows which turmas a professor works in. Owns its
estudantes and aulas, which remain associated with that turma when several
turmas de redução share a caderneta. Whether the professor is regente or the
turma is a turma de redução is specific to that professor's relationship with
the turma, as identified by the grupo diário.
_Avoid_: class, grupo

**regente**:
The professor's relationship with a turma when the portal's grupo diário
identifies them as responsible for it as regente. A caderneta for this
relationship covers one turma. This designation applies to the relationship
between professor and turma, not to the professor across all their turmas.
_Avoid_: titular, papel de acesso

**turma de redução**:
A turma whose grupo diário identifies redução for that professor. One to four
turmas de redução for the same professor compose a single caderneta
automatically. Existing groups keep their membership when possible; additional
turmas fill available places in stable cadastro order, with at most four per
caderneta. A turma where the professor is regente keeps its separate caderneta.
The designation belongs to the relationship between professor and turma;
it is not an intrinsic property of the turma.
_Avoid_: turma reduzida, turma de regência

**nome curto da turma**:
What a turma is called on screen, derived from the name the portal writes. The
portal spells a turma as `<série> - <turma> - <turno>`, repeating the série and
appending the turno — `PRÉ-ESCOLA II - PRÉ-ESCOLA II - C - INTEGRAL`. Only the
middle identifies it (`PRÉ-ESCOLA II - C`), so that is what is shown; the full
name stays the stored one, since it is what the portal and the caderneta key on.
_Avoid_: nome amigável, display name

**turno**:
The shift a turma runs in — `MATUTINO`, `VESPERTINO` or `INTEGRAL`. The portal
has no field for it: it writes the turno at the end of the turma's name, so it
is read from there rather than asked for.
_Avoid_: shift, período

**etapa**:
One of the four periods the school year is divided into. Its start and end dates come from the calendário acadêmico.
_Avoid_: term, período, bimestre

**calendário acadêmico**:
The external academic calendar that dictates each etapa's start and end dates.
_Avoid_: calendar, cronograma

**período letivo**:
The portal's own partition of a school's year, chosen on its _Configurações de
ambiente_ dialog before anything else — `2026` for the regular turmas, `2026
EJA` for the EJA ones. Each período letivo has its own etapas and turmas, and
the portal session lives in one at a time, so every turma is remembered with
the período letivo it was found in and the session moves there before reading
or writing it. A professor may have turmas in more than one.
_Avoid_: calendário letivo, ano letivo, ambiente

**mês**:
A month within an etapa. An etapa spans two or three of them. Purely a way of narrowing what you are looking at — it carries no completeness of its own.
_Avoid_: month, período

**grupo diário**:
The portal field labeled _Grupo diário_, whose value identifies whether the
professor is regente of the selected turma or that turma is a turma de redução
for them. A value beginning with the word `REDUÇÃO` identifies redução:
`REDUÇÃO MANHÃ`, `REDUÇÃO TARDE` and `REDUÇÃO NOITE` are examples, and the
portal also uses a professor's name, as in `REDUÇÃO VITORIA`. `REGENTE MANHÃ`
is an observed value for regente. An unread or ambiguous field remains unknown.
_Avoid_: redução, turno

**redução**:
The designation in the grupo diário that marks a turma de redução for the
professor. The portal writes it as `REDUÇÃO MANHÃ`, `REDUÇÃO TARDE`,
`REDUÇÃO NOITE` or a named value such as `REDUÇÃO VITORIA`. The suffix is read
from that field independently of the turno
written in the turma's name.
_Avoid_: grupo diário, turno

**aula**:
One dated lesson in a turma. The unit of completeness: a caderneta advances one aula at a time.
_Avoid_: lesson, class, dia

**estudante**:
A student enrolled in a turma, named as such by the portal.
_Avoid_: aluno, student, criança

**matrícula**:
An estudante's enrolment in a turma, carrying a situação (e.g. `ATIVO`) and a data da matrícula. The boletim is keyed by matrícula, not by person.
_Avoid_: enrolment, registration

### Partes da caderneta

**conteúdo**:
What was taught in each aula. Filled in on the portal's _Lançamento de Conteúdo_ screen.
_Avoid_: content, plano de aula

**frequência**:
Attendance of each estudante at each aula. Filled in on the portal's _Lançamento de Presença_ screen.
_Avoid_: presença, attendance, chamada

**ficha de desempenho**:
The performance sheet for each estudante. The portal's _Ficha Desempenho_ screen.
_Avoid_: performance sheet, avaliação

**ficha descritiva**:
The descriptive sheet for each estudante. The portal's _Ficha Descritiva/Monitoramento_ screen.
_Avoid_: descriptive sheet, relatório, parecer

**boletim**:
The grade grid holding every estudante's notas for an etapa. The portal's _Resultado de Avaliação_ screen. Filling it in requires the etapa's avaliações to already exist.
_Avoid_: notas, report card, resultado

### Campos

**ordem da aula**:
An aula's position within its dia.
_Avoid_: order, posição

**código CR**:
The curriculum reference recorded against an aula's conteúdo.
_Avoid_: codigo, referência curricular, BNCC

**desenvolvimento**:
The narrative of how an aula was taught. The portal labels this field _Desenvolvimento / Metodologia_.
_Avoid_: metodologia, description, conteúdo

**ferramentas**:
The resources used in an aula. The portal labels this field _Ferramentas Utilizadas_.
_Avoid_: recursos, materiais, tools

**recuperação**:
Whether an aula was a make-up lesson.
_Avoid_: makeup, reforço

**interação**:
Whether an aula involved interaction, recorded per aula alongside recuperação.
_Avoid_: interaction, participação

**avaliação**:
An assessment an etapa's notas are given against, with a nome, tipo (e.g. `OBSERVAÇÃO`, `TRABALHO EM GRUPO`, `AVALIAÇÃO/PROVA`), data and valor. Created on the portal's _Cadastro de Avaliação_ screen before the boletim can be filled in.
_Avoid_: assessment, prova, atividade

**disciplina**:
A subject a turma is taught. Each turma in a caderneta may have several
disciplinas, each with its own boletim for that turma. The portal only offers
it once the etapa has an avaliação, so no disciplina means no avaliação has
been registered yet.
_Avoid_: subject, matéria, componente

**nota**:
What one estudante scored on one avaliação — one cell of the boletim, where a
student's row meets an avaliação's column. Within its turma, keyed by
matrícula, disciplina and avaliação, never by name: the name is what a
professor writes, the matrícula is what the portal stores.
_Avoid_: grade, score, pontuação

**nota personalizada**:
A grade the professor sets on an estudante's row directly, outside any
avaliação. Editable, unlike the ones the portal computes.
_Avoid_: custom grade, nota manual

**nota parcial**:
A grade the portal computes for an estudante's row and shows read-only,
alongside the **nota calculada pelas avaliações**. Esmeraldinha reads both and
writes neither.
_Avoid_: partial grade, prévia

**nota final da etapa**:
The grade an estudante closes an etapa with, written on their row of the
boletim. Editable, unlike the nota parcial and the nota calculada.
_Avoid_: final grade, média

### Classificação de notas

**classificação**:
How an estudante did in their turma: _Acima da média_ (nota final da etapa of
8 to 10), _Na média_ (6 to less than 8) or _Abaixo da média_ (less than 6),
scaled when an etapa's avaliações do not add up to 10. Choosing one generates
the top of its band (10, 7 or 5), split across the avaliações in steps of
0,5; editing the nota final or an avaliação moves the classificação to the
band the sum falls in. Remembered per estudante of the turma, across every
etapa and disciplina, when it differs from the classificação padrão; an
estudante who matches the padrão keeps following it. The portal's notas win
when they disagree.
_Avoid_: conceito, nível, faixa

**classificação padrão**:
The classificação an estudante of a turma gets while they have neither notas
on the portal nor a classificação of their own. Starts at _Acima da média_,
so an empty boletim opens with 10 for everyone.
_Avoid_: default, classificação geral

**chat de notas**:
The conversation the auxiliar de ensino has with the agent from _Lançar
Notas_ about one etapa and disciplina ("a turma foi acima da média, menos
X"). The agent only decides notas finais; the split into avaliações and the
classificação follow the same rules as the grid. Nothing reaches the portal
from it.
_Avoid_: assistente de notas, IA

### Chat de conteúdos

**chat de conteúdos**:
The conversation the auxiliar de ensino has with the agent, from the _Lançar
Conteúdo_ screen, to write the conteúdo of the aulas still empty in one mês or
in a whole etapa. The agent reads the conversation, the anexos and the aulas
de referência; the portal is never touched from it.
_Avoid_: assistente, gerador, IA

**escopo da conversa**:
What a chat de conteúdos is about: one mês of an etapa, or the etapa inteira.
Only the aulas in the escopo get rascunhos.
_Avoid_: filtro, período

**rascunho de conteúdo**:
The conteúdo of one aula as the agent wrote it — código CR, desenvolvimento
and ferramentas — before the auxiliar de ensino reviews it. Lives only on the
screen: the preenchimento assistido prepares all aulas the auxiliar keeps
marked, with a separate portal tab for each mês. The auxiliar reviews and
saves there, then asks Esmeraldinha to verify the saved conteúdo in a fresh
sessão do portal. Only verified aulas lose their rascunhos; pending ones stay.
_Avoid_: sugestão, geração, draft

**aula de referência**:
An aula that already has conteúdo, from another mês or etapa, that the auxiliar
de ensino picks as a base for the agent — the professor's way of writing and
the thread of what was taught. The aulas of the escopo already in the portal
are a base by themselves, without being picked.
_Avoid_: exemplo, template, modelo

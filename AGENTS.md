# Esmeraldinha

Automatiza o cadastro de cadernetas dos professores no portal do professor de limoeiro de anadia sob a perspectiva do auxiliar de ensino.

O glossário do domínio vive em `CONTEXT.md`.

# Regras de negócio

1. Um professor pode solicitar o preenchimento de várias cadernetas
2. Uma caderneta é composta por:
   1. Conteúdo de cada aula
   2. Frequência de cada estudante
   3. Ficha de desempenho de cada estudante
   4. Ficha descritiva de cada estudante
   5. Boletim de notas de cada estudante
3. Uma caderneta é vinculada a uma turma
4. Uma caderneta só é considerada finalizada quando essas informações estão preenchidas para todas as aulas de todas as 4 etapas do ano letivo
5. A data de inicialização e finalização de cada uma das 4 etapas do ano letivo depende do calendário acadêmico
6. O usuário final do sistema é o auxiliar de ensino, que recebe as solicitações dos professores
7. Cada professor vai enviar o conteúdo de cada caderneta em formato de texto, imagem(manuscrita/digitada) e/ou pdf
8. Não existe uma ordem correta de envio de conteúdo, o sistema deve saber qual parte da caderneta preencher apenas interpretando o conteúdo enviado
9. O portal não oferece acesso delegado, então o professor entrega as próprias credenciais ao auxiliar de ensino e a Esmeraldinha precisa guardá-las com segurança. O `localStorage` usado hoje é apenas andaime de teste, não a solução final

# Instruções

1. Desenvolva começando da maneira mais simples de desenvolver aquela funcionalidade e utilize conceitos de arquitetura limpa, DDD, SOLID só quando necessário para o crescimento da aplicação. A única exceção é a linguagem ubíqua, que mantemos desde o início: os termos do domínio definidos em `CONTEXT.md` permanecem em português em prosa, em identificadores de código e em nomes de arquivo; todo o resto — prosa, títulos, comentários e identificadores que não sejam do domínio — é escrito em inglês.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim as `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

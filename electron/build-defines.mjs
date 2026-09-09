/**
 * O app empacotado não lê `.env`: o instalador é um arquivo só, e não há
 * onde colocá-lo na máquina do auxiliar de ensino. As variáveis abaixo, por
 * isso, entram no bundle na hora de empacotar — no CI elas vêm dos secrets
 * do repositório, e localmente do ambiente de quem roda `pnpm build:electron`.
 *
 * Só estas: são as que identificam a conta do auxiliar de ensino no primeiro
 * acesso. O resto continua sendo lido do ambiente em tempo de execução.
 */
export const VARIAVEIS_DE_BUILD = [
  'ESMERALDINHA_LOGIN',
  'ESMERALDINHA_SENHA_TEMPORARIA',
];

/**
 * O mapa de `define` do esbuild para as variáveis que o ambiente informou.
 * As que ele não informou ficam de fora de propósito: sem `define`, o código
 * segue lendo `process.env` como faz em `pnpm dev` e nos testes.
 */
export function definesDoBuild(env = process.env) {
  return Object.fromEntries(
    VARIAVEIS_DE_BUILD.filter((nome) => (env[nome] ?? '').trim() !== '').map(
      (nome) => [`process.env.${nome}`, JSON.stringify(env[nome])],
    ),
  );
}

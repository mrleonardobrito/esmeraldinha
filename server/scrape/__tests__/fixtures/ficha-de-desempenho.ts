/**
 * HTML shaped like the portal's ficha de desempenho dialog, with the same id
 * structure and nesting seen on the real portal
 * (`.scratch/ficha-de-desempenho/tela-do-portal.md`). Only what the scraper
 * reads is reproduced.
 */

export interface AreaDoFixture {
  titulo: string;
  habilidades: string[];
}

export const OPCOES_DO_PORTAL = [
  ['46', 'R - REALIZA'],
  ['71', 'RD - REALIZA COM DIFICULDADES'],
  ['21', 'NR - NÃO REALIZA '],
] as const;

const ETAPAS = ['I ETAPA', 'II ETAPA', 'III ETAPA', 'IV ETAPA'];

/** `valores` maps `area.habilidade.etapa` to the option text prefix (`R`, `RD`, `NR`). */
export function dialogoDaFicha({
  matricula,
  areas,
  valores = {},
  opcoes = OPCOES_DO_PORTAL,
}: {
  matricula: string;
  areas: readonly AreaDoFixture[];
  valores?: Record<string, string>;
  opcoes?: readonly (readonly [string, string])[];
}): string {
  const p = 'j_idt314:j_idt344';
  return `<div id="dlgFichaEtapa">
    <input id="j_idt266:j_idt267:j_idt268:matriculaAluno-CP-UP" type="text" value="${matricula}" disabled>
    <span id="divFichasEtapas"><div id="${p}"><table><tbody id="${p}_data">
    ${areas.map((area, a) => `<tr data-ri="${a}"><td><span>Área de Conhecimento</span>
      <div><span>${area.titulo}</span></div>
      <div id="${p}:${a}:dtlistConceitoFichaVo"><table>
        <thead><tr><th><span>Descritores</span></th><th><span>Resposta</span></th></tr></thead>
        <tbody id="${p}:${a}:dtlistConceitoFichaVo_data">
        ${area.habilidades.map((texto, h) => `<tr data-ri="${h}"><td>${h + 1}° ${texto}</td><td>
          <div id="${p}:${a}:dtlistConceitoFichaVo:${h}:dtdatamodel"><table><tbody><tr data-ri="0"><td>
            <table><tbody><tr data-ri="0"><td><div><span>Única</span></div></td></tr>
            ${ETAPAS.map((etapa, e) => {
              const id = `${p}:${a}:dtlistConceitoFichaVo:${h}:dtdatamodel:0:j_idt322:${e + 1}:j_idt327:somRespostas`;
              const escolhido = valores[`${a}.${h}.${e + 1}`];
              const label = escolhido ? opcoes.find(([, t]) => t.startsWith(`${escolhido} -`))?.[1] : ' ';
              return `<tr data-ri="${e + 1}"><td><div class="ui-panelgrid-cell">${etapa}: </div>
                <div class="ui-panelgrid-cell"><div id="${id}">
                  <select id="${id}_input" onchange="document.querySelector('#onchanges').value++">
                    <option data-escape="true">&amp;nbsp;</option>
                    ${opcoes.map(([valor, texto]) => `<option value="${valor}"${escolhido && texto.startsWith(`${escolhido} -`) ? ' selected' : ''}>${texto}</option>`).join('')}
                  </select>
                  <label id="${id}_label">${label}</label>
                </div></div></td></tr>`;
            }).join('')}
            </tbody></table>
          </td></tr></tbody></table></div>
        </td></tr>`).join('')}
        </tbody></table></div>
    </td></tr>`).join('')}
    </tbody></table></div></span>
    <output id="onchanges">0</output>
  </div>`;
}

export interface EstudanteDoFixture {
  matricula: string;
  nome: string;
  situacao: string;
}

/**
 * The _Ficha Desempenho_ list (cells carry the reflow column title, as on the
 * portal) with a dialog that behaves like the portal's:
 * the Salvar buttons keep the dialog's values as saved (in `window.__salvos`)
 * and move to the next or previous estudante; Fechar discards. Every button
 * click is recorded in `window.__cliques`.
 */
export function portalDaFicha({
  turma,
  ficha,
  estudantes,
  areas,
}: {
  turma: string;
  ficha: string;
  estudantes: readonly EstudanteDoFixture[];
  areas: readonly AreaDoFixture[];
}): string {
  const menu = (sufixo: string, opcao: string) => `<div id="f:${sufixo}" class="ui-selectonemenu">
    <select id="f:${sufixo}_input"><option value=""></option><option value="1">${opcao}</option></select></div>`;
  return `
    <a href="#" onclick="return false">Etapa</a>
    <a href="#" onclick="document.querySelector('#tela').hidden = false; return false">Ficha Desempenho</a>
    <section id="tela" hidden>
      ${menu('turma-SOM-CP-OBR', turma)}
      ${menu('fichaDesempenho-SOM-CP-OBR', ficha)}
      <table><tbody>${estudantes.map((e, i) => `<tr data-ri="${i}">
        <td><span class="ui-column-title">Ordem</span>${i + 1}</td>
        <td><span class="ui-column-title">Matrícula</span>${e.matricula}</td>
        <td>${e.nome}<button type="button" onclick="abrir('${e.matricula}')">Cadastrar</button>
          Nome social: Situação: ${e.situacao}</td></tr>`).join('')}</tbody></table>
    </section>
    <div id="dialogo"></div>
    <div id="botoes" hidden>
      <button type="button" onclick="clicar('Salvar e anterior')">Salvar e anterior</button>
      <button type="button" onclick="clicar('Salvar e sair')">Salvar e sair</button>
      <button type="button" onclick="clicar('Salvar e próximo')">Salvar e próximo</button>
      <button type="button" onclick="clicar('Fechar')">Fechar</button>
    </div>
    ${estudantes.map((e) => `<template id="t-${e.matricula}">${dialogoDaFicha({ matricula: e.matricula, areas })}</template>`).join('')}
    <script>
      const ordem = ${JSON.stringify(estudantes.map((e) => e.matricula))};
      const salvos = new Map();
      window.__salvos = {};
      window.__cliques = [];
      let atual = null;
      function abrir(matricula) {
        const container = document.querySelector('#dialogo');
        container.replaceChildren(salvos.get(matricula) ?? document.querySelector('#t-' + matricula).content.cloneNode(true));
        document.querySelector('#botoes').hidden = false;
        atual = matricula;
      }
      function salvar() {
        const valores = {};
        for (const sel of document.querySelectorAll('#dialogo select')) {
          if (sel.selectedIndex <= 0) continue;
          const m = /:(\\d+):dtlistConceitoFichaVo:(\\d+):dtdatamodel:0:[^:]+:(\\d):/.exec(sel.id);
          valores[m[1] + '.' + m[2] + '.' + m[3]] = sel.options[sel.selectedIndex].text.split(' - ')[0];
        }
        window.__salvos[atual] = valores;
        salvos.set(atual, document.querySelector('#dialogo').firstElementChild);
      }
      function fechar() {
        document.querySelector('#dialogo').replaceChildren();
        document.querySelector('#botoes').hidden = true;
        atual = null;
      }
      // Like the portal, a Salvar empties the dialog while its AJAX runs and
      // only then renders the next estudante.
      window.jQuery = { active: 0 };
      function clicar(botao) {
        window.__cliques.push(botao);
        if (botao === 'Fechar') return fechar();
        salvar();
        const i = ordem.indexOf(atual);
        const proxima = botao === 'Salvar e sair' ? undefined : ordem[botao === 'Salvar e próximo' ? i + 1 : i - 1];
        window.jQuery.active = 1;
        document.querySelector('#dialogo').replaceChildren();
        setTimeout(() => {
          if (proxima) abrir(proxima); else fechar();
          window.jQuery.active = 0;
        }, 400);
      }
    </script>`;
}

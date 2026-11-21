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

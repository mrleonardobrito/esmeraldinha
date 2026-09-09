import { chromium } from "playwright";

const outDir = "/tmp/claude-1000/-home-mrleonardobrito-Projects-Pessoal-esmeraldinha/55f21058-8f9d-435d-8bea-8d105dc6b1d0/scratchpad/preenchimento-design";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
page.on("console", (msg) => console.log("[console]", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto("http://localhost:5183/dev-preview.html");

await page.getByRole("button", { name: /Colar texto em vez de arquivo/ }).click();
await page.locator("#envio-texto").fill("Notas da prova 1.");
await page.getByRole("button", { name: /Analisar/ }).click();

await page.getByText("Precisam de confirmação").waitFor({ timeout: 5000 });
await page.screenshot({ path: `${outDir}/01-preview-inicial.png`, fullPage: true });

// Abre o resolvedor do primeiro item com falha (typo simples).
await page.getByText("MATHEUS VITOR PEREYRA").first().click();
await page.screenshot({ path: `${outDir}/02-resolver-aberto-sem-match.png`, fullPage: true });

// Corrige o typo digitando o nome certo -> deve listar e permitir Enter.
const busca = page.getByPlaceholder("Digite para corrigir ou buscar um estudante");
await busca.fill("MATHEUS VITOR PEREIRA");
await page.screenshot({ path: `${outDir}/03-resolver-digitado.png`, fullPage: true });
await busca.press("Enter");
await page.screenshot({ path: `${outDir}/04-apos-enter.png`, fullPage: true });

// Abre o item ambíguo "RAFAEL EDUARDO": deve listar os dois Rafaels de cara.
await page.getByText("RAFAEL EDUARDO", { exact: true }).click();
await page.screenshot({ path: `${outDir}/05-ambiguo-aberto.png`, fullPage: true });

// Escolhe o primeiro Rafael da lista (pareamento por clique).
await page.getByRole("button", { name: "RAFAEL EDUARDO BARROS 12807" }).click();
await page.screenshot({ path: `${outDir}/06-apos-parear-rafael.png`, fullPage: true });

// Abre "NATALIA DUARTE" e confirma que Rafael Barros já não aparece em
// nenhuma outra lista (checa duplicidade).
await page.getByText("NATALIA DUARTE", { exact: true }).click();
await page.screenshot({ path: `${outDir}/07-natalia-aberto.png`, fullPage: true });

// Expande a lista de prontas para conferir os "corrigido".
const abrirProntas = page.getByText(/Prontas para preencher/);
await abrirProntas.click();
await page.screenshot({ path: `${outDir}/08-prontas-abertas.png`, fullPage: true });

await browser.close();
console.log("done");

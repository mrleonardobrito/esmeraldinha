import * as React from "react";
import { createRoot } from "react-dom/client";

import { EnvioDeMaterial } from "@/components/envio-de-material";
import "@/globals.css";

const fixture = {
  plano: {
    parte: "boletim",
    etapa: "3ª Etapa",
    turma: "6º B",
    mes: "",
    observacao: "",
    aulas: [],
    avaliacao: "PROVA 1",
    disciplina: "Português",
    notas: [
      { estudante: "ANA BEATRIZ FERREIRA LIMA", valor: 9 },
      { estudante: "BRUNO HENRIQUE ALVES COSTA", valor: 7.5 },
      { estudante: "CAMILA SOUZA RIBEIRO", valor: 8 },
      { estudante: "MATHEUS VITOR PEREYRA", valor: 6.5 },
      { estudante: "NATALIA DUARTE", valor: 9.5 },
      { estudante: "RAFAEL EDUARDO", valor: 7 },
    ],
  },
  cadernetaId: "cad-1",
  itens: [
    { status: "pronta", rotulo: "12801" },
    { status: "pronta", rotulo: "12802" },
    { status: "pronta", rotulo: "12803" },
    {
      status: "falha",
      rotulo: "MATHEUS VITOR PEREYRA",
      motivo: 'Nenhum estudante da turma se chama "MATHEUS VITOR PEREYRA".',
    },
    {
      status: "falha",
      rotulo: "NATALIA DUARTE",
      motivo: 'Nenhum estudante da turma se chama "NATALIA DUARTE".',
    },
    {
      status: "falha",
      rotulo: "RAFAEL EDUARDO",
      motivo:
        '"RAFAEL EDUARDO" combina com mais de um estudante da turma: RAFAEL EDUARDO BARROS, RAFAEL EDUARDO BASTOS.',
      candidatos: ["12807", "12808"],
    },
  ],
  notasResolvidas: [
    { matricula: "12801", avaliacao: "PROVA 1", valor: 9 },
    { matricula: "12802", avaliacao: "PROVA 1", valor: 7.5 },
    { matricula: "12803", avaliacao: "PROVA 1", valor: 8 },
    null,
    null,
    null,
  ],
  estudantes: [
    { matricula: "12801", nome: "ANA BEATRIZ FERREIRA LIMA" },
    { matricula: "12802", nome: "BRUNO HENRIQUE ALVES COSTA" },
    { matricula: "12803", nome: "CAMILA SOUZA RIBEIRO" },
    { matricula: "12804", nome: "DANIEL OLIVEIRA MARTINS" },
    { matricula: "12805", nome: "MATHEUS VITOR PEREIRA" },
    { matricula: "12806", nome: "NATALIA REGINA DUARTE" },
    { matricula: "12807", nome: "RAFAEL EDUARDO BARROS" },
    { matricula: "12808", nome: "RAFAEL EDUARDO BASTOS" },
  ],
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input as Request).url;
  if (url.includes("/envios") && (init?.method ?? "GET") === "POST") {
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <div className="mx-auto max-w-4xl p-8">
    <EnvioDeMaterial sessionId="s1" professorId="p1" />
  </div>,
);

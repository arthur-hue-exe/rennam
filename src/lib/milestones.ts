export type MilestoneTier = "normal" | "big" | "mega";

export type Milestone = {
  at: number;
  title: string;
  messages: string[];
  tier: MilestoneTier;
};

export const MILESTONES: Milestone[] = [
  {
    at: 10,
    title: "10 TORADAS!",
    messages: ["O bigode já está sentindo.", "Dez blocos depois, ninguém segura."],
    tier: "normal",
  },
  {
    at: 25,
    title: "25 TORADAS!",
    messages: ["Tá pegando fogo, hein!", "O Rennam tá torado de verdade."],
    tier: "normal",
  },
  {
    at: 50,
    title: "50 TORADAS!",
    messages: ["Meio século de cabeçada.", "Os blocos já pediram férias."],
    tier: "normal",
  },
  {
    at: 100,
    title: "100 TORADAS!",
    messages: ["O bloco pediu socorro!", "COMIXXX! Cem de uma vez."],
    tier: "big",
  },
  {
    at: 500,
    title: "500 TORADAS!!!",
    messages: ["ISSO NÃO É MAIS UM JOGO, É UM ESTILO DE VIDA.", "O reino inteiro ouviu essa cabeçada."],
    tier: "mega",
  },
];

export function pickMilestoneMessage(milestone: Milestone): string {
  return milestone.messages[Math.floor(Math.random() * milestone.messages.length)];
}

import GameStage from "@/components/game/GameStage";

export default function Home() {
  return (
    <>
      <GameStage />
      <noscript>
        <p className="noscript">Ative o JavaScript para jogar Rennam Torado.</p>
      </noscript>
    </>
  );
}

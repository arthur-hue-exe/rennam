export default function Scene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="sky" />
      <div className="sky-glow" />

      <img
        className="cloud cloud-a"
        src="/sprites/cloud.png"
        alt=""
        width={40}
        height={16}
        draggable={false}
      />
      <img
        className="cloud cloud-b"
        src="/sprites/cloud.png"
        alt=""
        width={40}
        height={16}
        draggable={false}
      />
      <img
        className="cloud cloud-c"
        src="/sprites/cloud.png"
        alt=""
        width={40}
        height={16}
        draggable={false}
      />

      <img
        className="hill hill-left"
        src="/sprites/hill.png"
        alt=""
        width={80}
        height={44}
        draggable={false}
      />
      <img
        className="hill hill-right"
        src="/sprites/hill.png"
        alt=""
        width={80}
        height={44}
        draggable={false}
      />

      <img
        className="bush bush-left"
        src="/sprites/bush.png"
        alt=""
        width={48}
        height={16}
        draggable={false}
      />
      <img
        className="bush bush-right"
        src="/sprites/bush.png"
        alt=""
        width={48}
        height={16}
        draggable={false}
      />
      <img
        className="bush bush-mid"
        src="/sprites/bush.png"
        alt=""
        width={48}
        height={16}
        draggable={false}
      />

      <img
        className="deco-coin deco-coin-a"
        src="/sprites/coin.png"
        alt=""
        width={10}
        height={14}
        draggable={false}
      />
      <img
        className="deco-coin deco-coin-b"
        src="/sprites/coin.png"
        alt=""
        width={10}
        height={14}
        draggable={false}
      />

      <div className="ground">
        <div className="ground-edge" />
        <div className="ground-grass" />
        <div className="ground-dirt" />
      </div>
    </div>
  );
}

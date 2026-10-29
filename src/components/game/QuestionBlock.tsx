import type { Ref } from "react";

type QuestionBlockProps = {
  variant: "main" | "left" | "right";
  slotRef?: Ref<HTMLDivElement>;
  bobRef?: Ref<HTMLDivElement>;
  imgRef?: Ref<HTMLImageElement>;
};

export default function QuestionBlock({
  variant,
  slotRef,
  bobRef,
  imgRef,
}: QuestionBlockProps) {
  return (
    <div className={`block-slot block-${variant}`} ref={slotRef}>
      <div className={`block-bob bob-${variant}`} ref={bobRef}>
        <img
          className="block-img"
          ref={imgRef}
          src="/sprites/block.png"
          alt=""
          width={16}
          height={16}
          draggable={false}
        />
      </div>
    </div>
  );
}

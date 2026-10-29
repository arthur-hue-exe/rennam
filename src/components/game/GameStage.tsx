"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useRetroSound } from "@/hooks/useRetroSound";
import { useSharedCounter } from "@/hooks/useSharedCounter";
import { compareDecimal } from "@/lib/format";
import {
  MILESTONES,
  pickMilestoneMessage,
  type Milestone,
  type MilestoneTier,
} from "@/lib/milestones";
import MilestoneBanner, { type BannerContent } from "./MilestoneBanner";
import NoticeToast from "./NoticeToast";
import ParticleLayer, { type ParticleHandle } from "./ParticleLayer";
import QuestionBlock from "./QuestionBlock";
import Scene from "./Scene";
import Scoreboard from "./Scoreboard";
import TorarButton from "./TorarButton";

type Frame = "idle" | "crouch" | "jump" | "hit";

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

export default function GameStage() {
  const { value, status, pending, failedClicks, clicks, notice, retrying, torar, retryFailed, dismissNotice } =
    useSharedCounter();
  const { enabled: soundEnabled, toggle: toggleSound, audio } = useRetroSound();
  const reducedMotion = useReducedMotion();

  const [frame, setFrame] = useState<Frame>("idle");
  const [banner, setBanner] = useState<BannerContent | null>(null);
  const [celebrating, setCelebrating] = useState<MilestoneTier | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const blockSlotRef = useRef<HTMLDivElement | null>(null);
  const blockImgRef = useRef<HTMLImageElement | null>(null);
  const sideBlockImgsRef = useRef<Array<HTMLImageElement | null>>([]);
  const playerSlotRef = useRef<HTMLDivElement | null>(null);
  const playerImgRef = useRef<HTMLImageElement | null>(null);
  const playerShadowRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<ParticleHandle>(null);

  const processedEventRef = useRef(0);
  const jumpQueueRef = useRef<boolean[]>([]);
  const jumpingRef = useRef(false);
  const mountedRef = useRef(true);
  const previousValueRef = useRef<string | null>(null);
  const reachedMilestonesRef = useRef<Set<number>>(new Set());
  const bannerTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  const bannerSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    ["idle", "jump", "crouch", "hit"].forEach((frameName) => {
      const image = new Image();
      image.src = `/sprites/player-${frameName}.png`;
    });
  }, []);

  const showBanner = useCallback((content: Omit<BannerContent, "id">) => {
    bannerSeqRef.current += 1;
    setBanner({ ...content, id: bannerSeqRef.current });
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(
      () => setBanner(null),
      content.tier === "mega" ? 5200 : 3600,
    );
  }, []);

  const triggerCelebration = useCallback((tier: MilestoneTier) => {
    setCelebrating(tier);
    if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = window.setTimeout(
      () => setCelebrating(null),
      tier === "mega" ? 2600 : 1600,
    );
  }, []);

  const spawnPlusOne = useCallback((x: number, y: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const element = document.createElement("span");
    element.className = "plus-one";
    element.textContent = "+1";
    element.setAttribute("aria-hidden", "true");
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    stage.appendChild(element);
    const animation = element.animate(
      [
        { transform: "translate(-50%, 0) scale(1)", opacity: 1 },
        { transform: "translate(-50%, -38px) scale(1.18)", opacity: 1, offset: 0.55 },
        { transform: "translate(-50%, -72px) scale(1)", opacity: 0 },
      ],
      { duration: 780, easing: "steps(8, end)" },
    );
    void animation.finished.then(() => element.remove()).catch(() => element.remove());
  }, []);

  const handleImpact = useCallback(() => {
    const stage = stageRef.current;
    const block = blockSlotRef.current;
    if (!stage || !block) return;

    const stageRect = stage.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const x = blockRect.left - stageRect.left + blockRect.width / 2;
    const y = blockRect.top - stageRect.top + blockRect.height;

    particlesRef.current?.impact(x, y, { reduced: reducedMotion });
    spawnPlusOne(x, y);
    audio.bump();
    window.setTimeout(() => audio.coin(), 45);

    const blockImage = blockImgRef.current;
    if (blockImage) {
      blockImage.getAnimations().forEach((animation) => animation.cancel());
      blockImage.animate(
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-11px)" },
          { transform: "translateY(0)" },
        ],
        { duration: reducedMotion ? 140 : 270, easing: "steps(3, end)" },
      );
    }

    sideBlockImgsRef.current.forEach((image, index) => {
      if (!image) return;
      image.getAnimations().forEach((animation) => animation.cancel());
      image.animate(
        [
          { transform: "translateY(0)" },
          { transform: `translateY(${index % 2 === 0 ? -5 : -7}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 220 + index * 40, easing: "steps(2, end)", delay: index * 35 },
      );
    });

    if (!reducedMotion) {
      worldRef.current?.animate(
        [
          { transform: "translate(0, 0)" },
          { transform: "translate(-3px, 2px)" },
          { transform: "translate(3px, -2px)" },
          { transform: "translate(-2px, -1px)" },
          { transform: "translate(0, 0)" },
        ],
        { duration: 170, easing: "steps(3, end)" },
      );
    }
  }, [audio, reducedMotion, spawnPlusOne]);

  const performJump = useCallback(
    async (fast: boolean) => {
      const player = playerImgRef.current;
      const slot = playerSlotRef.current;
      const block = blockSlotRef.current;
      const shadow = playerShadowRef.current;
      if (!player || !slot || !block) return;

      const distance = Math.max(56, slot.offsetTop - (block.offsetTop + block.offsetHeight) + 2);
      const prep = fast ? 40 : 90;
      const up = fast ? 120 : 180;
      const hold = fast ? 45 : 85;
      const down = fast ? 140 : 220;

      player.getAnimations().forEach((animation) => animation.cancel());
      player.style.transform = "translateY(0)";
      shadow?.getAnimations().forEach((animation) => animation.cancel());

      setFrame("crouch");
      const crouchAnimation = player.animate(
        [{ transform: "translateY(0)" }, { transform: `translateY(${fast ? 3 : 6}px)` }],
        { duration: prep, easing: "steps(2, end)", fill: "forwards" },
      );
      await crouchAnimation.finished.catch(() => undefined);
      if (!mountedRef.current) return;

      setFrame("jump");
      audio.jump();
      shadow?.animate(
        [
          { transform: "scaleX(1)", opacity: 0.42 },
          { transform: "scaleX(0.52)", opacity: 0.12 },
        ],
        { duration: up, easing: "ease-out", fill: "forwards" },
      );

      const jumpAnimation = player.animate(
        [
          { transform: `translateY(${fast ? 3 : 6}px)` },
          { transform: `translateY(-${distance}px)` },
        ],
        { duration: up, easing: "cubic-bezier(.2,.85,.3,1)", fill: "forwards" },
      );
      await jumpAnimation.finished.catch(() => undefined);
      if (!mountedRef.current) return;

      setFrame("hit");
      handleImpact();
      await wait(hold);
      if (!mountedRef.current) return;

      setFrame("jump");
      shadow?.animate(
        [
          { transform: "scaleX(0.52)", opacity: 0.12 },
          { transform: "scaleX(1)", opacity: 0.42 },
        ],
        { duration: down, easing: "ease-in", fill: "forwards" },
      );

      const fallAnimation = player.animate(
        [
          { transform: `translateY(-${distance}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: down, easing: "cubic-bezier(.55,0,.9,.5)", fill: "forwards" },
      );
      await fallAnimation.finished.catch(() => undefined);
      if (!mountedRef.current) return;

      player.getAnimations().forEach((animation) => animation.cancel());
      player.style.transform = "translateY(0)";
      setFrame("idle");
    },
    [audio, handleImpact],
  );

  const performJumpRef = useRef(performJump);
  useEffect(() => {
    performJumpRef.current = performJump;
  }, [performJump]);

  const pumpQueue = useCallback(async () => {
    if (jumpingRef.current) return;
    jumpingRef.current = true;
    try {
      while (jumpQueueRef.current.length > 0 && mountedRef.current) {
        const fast = jumpQueueRef.current.shift() ?? false;
        await performJumpRef.current(fast);
      }
    } finally {
      jumpingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const newEvents = clicks.filter((event) => event.id > processedEventRef.current);
    if (newEvents.length === 0) return;
    processedEventRef.current = newEvents[newEvents.length - 1].id;

    const busy = jumpingRef.current || jumpQueueRef.current.length > 0;
    newEvents.forEach((_, index) => {
      jumpQueueRef.current.push(busy || newEvents.length > 1 || index > 0);
    });
    void pumpQueue();
  }, [clicks, pumpQueue]);

  useEffect(() => {
    if (!value) return;
    const previous = previousValueRef.current;
    previousValueRef.current = value;

    if (previous === null) {
      for (const milestone of MILESTONES) {
        if (compareDecimal(value, String(milestone.at)) >= 0) {
          reachedMilestonesRef.current.add(milestone.at);
        }
      }
      return;
    }

    if (compareDecimal(value, previous) < 0) {
      reachedMilestonesRef.current.clear();
      showBanner({
        kicker: "LIMITE MÁXIMO",
        title: "PLACAR ZERADO!",
        message: "999.999.999.999.999.999 toradas! O contador voltou ao zero — bora de novo.",
        tier: "mega",
      });
      audio.wrap();
      particlesRef.current?.confetti({ mega: true, reduced: reducedMotion });
      particlesRef.current?.coinRain(28, { reduced: reducedMotion });
      triggerCelebration("mega");
      return;
    }

    const crossed: Milestone[] = [];
    for (const milestone of MILESTONES) {
      if (reachedMilestonesRef.current.has(milestone.at)) continue;
      if (
        compareDecimal(value, String(milestone.at)) >= 0 &&
        compareDecimal(previous, String(milestone.at)) < 0
      ) {
        reachedMilestonesRef.current.add(milestone.at);
        crossed.push(milestone);
      }
    }

    if (crossed.length === 0) return;
    const top = crossed[crossed.length - 1];

    showBanner({
      kicker: top.tier === "normal" ? "MARCO ALCANÇADO" : "EXPLOSÃO DE TORADAS",
      title: top.title,
      message: pickMilestoneMessage(top),
      tier: top.tier,
    });

    if (top.tier === "mega") {
      audio.megaMilestone();
      particlesRef.current?.confetti({ mega: true, reduced: reducedMotion });
      particlesRef.current?.coinRain(44, { reduced: reducedMotion });
      // The celebration answers a DB-confirmed counter change, not render-derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      triggerCelebration("mega");
    } else if (top.tier === "big") {
      audio.megaMilestone();
      particlesRef.current?.confetti({ reduced: reducedMotion });
      triggerCelebration("big");
    } else {
      audio.milestone();
    }
  }, [audio, reducedMotion, showBanner, triggerCelebration, value]);

  const handleTorar = useCallback(() => {
    audio.unlock();
    if (soundEnabled) audio.click();
    torar();
  }, [audio, soundEnabled, torar]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "Space" && event.code !== "Enter") return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button, a, input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      handleTorar();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTorar]);

  return (
    <main
      ref={stageRef}
      className={`game ${celebrating ? `is-celebrating celebrate-${celebrating}` : ""}`}
      aria-label="Rennam Torado, minigame de contador global"
    >
      <h1 className="sr-only">Rennam Torado</h1>

      <div className="world" ref={worldRef}>
        <Scene />
        <div className="playfield" aria-hidden="true">
          <QuestionBlock
            variant="left"
            imgRef={(element) => {
              sideBlockImgsRef.current[0] = element;
            }}
          />
          <QuestionBlock
            variant="right"
            imgRef={(element) => {
              sideBlockImgsRef.current[1] = element;
            }}
          />
          <QuestionBlock
            variant="main"
            slotRef={(element) => {
              blockSlotRef.current = element;
            }}
            imgRef={(element) => {
              blockImgRef.current = element;
            }}
          />

          <div
            className="player-slot"
            ref={(element) => {
              playerSlotRef.current = element;
            }}
          >
            <div
              className="player-shadow"
              ref={(element) => {
                playerShadowRef.current = element;
              }}
            />
            <img
              className="player-img"
              ref={(element) => {
                playerImgRef.current = element;
              }}
              src={`/sprites/player-${frame}.png`}
              alt=""
              width={16}
              height={26}
              draggable={false}
            />
          </div>
        </div>
      </div>

      <header className="hud">
        <div className="stage-tag" aria-hidden="true">
          <span className="stage-tag-label">MUNDO</span>
          <span className="stage-tag-value">1-1</span>
        </div>
        <Scoreboard
          value={value}
          status={status}
          pending={pending}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
        />
      </header>

      <ParticleLayer ref={particlesRef} />

      <div className="action-zone">
        <TorarButton onTorar={handleTorar} />
        <p id="torar-hint" className="torar-hint">
          CLIQUE, TOQUE OU APERTE ESPAÇO
        </p>
      </div>

      <NoticeToast
        message={notice}
        canRetry={failedClicks.length > 0}
        onRetry={retryFailed}
        retrying={retrying}
        onDismiss={dismissNotice}
      />

      <MilestoneBanner banner={banner} />

      <div className="crt" aria-hidden="true" />
    </main>
  );
}

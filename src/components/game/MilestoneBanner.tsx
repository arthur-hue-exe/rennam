import type { MilestoneTier } from "@/lib/milestones";

export type BannerContent = {
  id: number;
  kicker: string;
  title: string;
  message: string;
  tier: MilestoneTier;
};

export default function MilestoneBanner({ banner }: { banner: BannerContent | null }) {
  if (!banner) return null;

  return (
    <div className="milestone-layer">
      <div
        key={banner.id}
        className={`milestone milestone-${banner.tier}`}
        role="status"
        aria-live="polite"
      >
        <div className="milestone-burst" aria-hidden="true" />
        <p className="milestone-kicker">{banner.kicker}</p>
        <p className="milestone-title">{banner.title}</p>
        <p className="milestone-message">{banner.message}</p>
      </div>
    </div>
  );
}

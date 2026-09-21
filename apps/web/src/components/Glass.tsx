import { CARD_LAYER_NAMES, cardIndexVar, moshaLensMarkup, stageVars } from "../mosha/recipe";
import { PRESETS } from "../mosha/defaults";
import type { CardData, PresetId } from "../mosha/types";
import { SymbolIcon } from "./SymbolIcon";
import { cn } from "../lib/utils";
import type { CSSProperties, ReactNode } from "react";

export function MoshaLayers() {
  return (
    <>
      {CARD_LAYER_NAMES.map((name) => (
        <span key={name} className={name} aria-hidden="true" />
      ))}
    </>
  );
}

export function GlassPanel({
  children,
  className,
  tint = "#6b7c93",
}: {
  children: ReactNode;
  className?: string;
  tint?: string;
}) {
  return (
    <article className={cn("qs-panel", className)} style={{ "--tint": tint } as CSSProperties}>
      <div className="mosha-card-spin">
        <MoshaLayers />
        <div className="mosha-card-body">{children}</div>
      </div>
    </article>
  );
}

export function MoshaHand({
  cards,
  preset = "mist",
  onPick,
}: {
  cards: CardData[];
  preset?: PresetId;
  onPick?: (card: CardData) => void;
}) {
  const params = { ...PRESETS[preset].apply(), cards: cards.slice(0, 6), fan: { ...PRESETS[preset].apply().fan, cardW: 200, cardH: 280, gap: 96 } };
  const vars = stageVars(params);
  const n = cards.length;
  return (
    <section className="mosha-stage relative h-[400px] overflow-hidden rounded-[28px]" style={vars as CSSProperties} data-layout="fan" aria-label="Quant Work Trade 入口">
      <div dangerouslySetInnerHTML={{ __html: moshaLensMarkup(params.glass.refract) }} />
      <div className="mosha-ambient" aria-hidden="true" />
      <div className="mosha-hand-scale" style={{ transform: "scale(0.92)", transformOrigin: "center" }}>
        <div className="mosha-hand" data-layout="fan" data-count={n}>
          {cards.map((card, i) => (
            <article
              key={card.id}
              className="mosha-card"
              style={{ "--i": cardIndexVar(i, n), "--tint": card.tint, "--z": i + 1 } as CSSProperties}
              aria-hidden="true"
            >
              <span className="mosha-card-cast" aria-hidden="true" />
              <div className="mosha-card-spin">
                <MoshaLayers />
                <div className="mosha-card-body">
                  <p className="mosha-card-code">{card.code}</p>
                  <div className="mosha-card-symbol">
                    <SymbolIcon name={card.symbol} />
                  </div>
                  <div className="mosha-card-copy">
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {cards.map((card, i) => (
            <button
              key={`hit-${card.id}`}
              type="button"
              className="mosha-card-hit"
              style={{ "--i": cardIndexVar(i, n), "--z": i + 1 } as CSSProperties}
              aria-label={`${card.title}. ${card.description}`}
              onClick={() => onPick?.(card)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export const HERO_CARDS: CardData[] = [
  { id: "quant", code: "01 / QUANT", title: "量化", description: "复盘、因子、回测审查，产物可打开核对。", tint: "#c4453a", symbol: "diamond" },
  { id: "work", code: "02 / WORK", title: "工作", description: "表格、纪要、汇报，专家团分工交付。", tint: "#d4a017", symbol: "star" },
  { id: "trade", code: "03 / TRADE", title: "赛事", description: "模拟赛巡检与计划，写入必须确认。", tint: "#2f9b6a", symbol: "club" },
  { id: "skills", code: "04 / SKILL", title: "技能", description: "15 个可迁移方法，会话中按需加载。", tint: "#2f7eb8", symbol: "spade" },
];

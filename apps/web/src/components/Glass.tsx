import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { CARD_LAYER_NAMES, cardIndexVar, moshaLensMarkup, stageVars } from "../mosha/recipe";
import { PRESETS } from "../mosha/defaults";
import type { CardData, PresetId } from "../mosha/types";
import { SymbolIcon } from "./SymbolIcon";
import { cn } from "../lib/utils";

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
  const params = {
    ...PRESETS[preset].apply(),
    cards: cards.slice(0, 6),
    fan: { ...PRESETS[preset].apply().fan, cardW: 200, cardH: 280, gap: 96 },
  };
  const vars = stageVars(params);
  const n = cards.length;
  const lensId = `mosha-lens-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [fit, setFit] = useState(1);
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 719px)").matches : false,
  );
  const selected = active;

  useEffect(() => {
    const stage = root.current;
    if (!stage) return;
    const resize = () => {
      const isNarrow = stage.clientWidth < 720 || (typeof window !== "undefined" && window.innerWidth < 720);
      setNarrow(isNarrow);
      if (isNarrow) {
        setFit(1);
        return;
      }
      const css = getComputedStyle(stage);
      const read = (k: string) => parseFloat(css.getPropertyValue(k)) || 0;
      const half = (cards.length - 1) / 2;
      const w = read("--mosha-card-w") || params.fan.cardW;
      const h = read("--mosha-card-h") || params.fan.cardH;
      const gap = read("--mosha-gap") || params.fan.gap;
      const arc = read("--mosha-arc") || params.fan.arc;
      const lift = read("--mosha-lift") || params.motion.lift;
      const span = w + (cards.length - 1) * gap + h + 60;
      const tall = h + half * half * arc + lift + w + 60;
      setFit(Math.max(0.05, Math.min(1, (stage.clientWidth - 24) / span, (stage.clientHeight - 24) / tall)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
  }, [cards.length, params.fan.cardW, params.fan.cardH, params.fan.gap, params.fan.arc, params.motion.lift]);

  function move(event: PointerEvent<HTMLElement>) {
    const r = event.currentTarget.getBoundingClientRect();
    if (r.width && r.height) {
      event.currentTarget.style.setProperty("--mosha-lx", `${((event.clientX - r.left) / r.width) * 100}%`);
      event.currentTarget.style.setProperty("--mosha-ly", `${((event.clientY - r.top) / r.height) * 100}%`);
    }
  }

  if (narrow) {
    return (
      <section ref={root} className="qs-hero-stack" data-layout="stack" aria-label="Quant Work Trade 入口">
        {cards.map((card) => (
          <button key={card.id} type="button" className="qs-hero-stack-item" onClick={() => onPick?.(card)}>
            <GlassPanel tint={card.tint}>
              <p className="mosha-card-code">{card.code}</p>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </GlassPanel>
          </button>
        ))}
      </section>
    );
  }

  return (
    <section
      ref={root}
      className="mosha-stage relative min-h-[480px] rounded-[28px]"
      style={{ ...vars, "--mosha-lens-filter": `url(#${lensId})`, "--mosha-fit": fit, height: 520 } as CSSProperties}
      data-layout="fan"
      data-refract={params.glass.refract > 0 ? 1 : 0}
      aria-label="Quant Work Trade 入口"
      onPointerMove={move}
      onPointerLeave={() => {
        if (!root.current?.contains(document.activeElement)) setActive(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setActive(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setActive(null);
      }}
    >
      <div dangerouslySetInnerHTML={{ __html: moshaLensMarkup(params.glass.refract, lensId) }} />
      <div className="mosha-ambient" aria-hidden="true" />
      <div className="mosha-hand-scale">
        <div className={selected === null ? "mosha-hand" : "mosha-hand is-isolating"} data-layout="fan" data-count={n}>
          {cards.map((card, i) => (
            <article
              key={card.id}
              className={selected === i ? "mosha-card is-active" : "mosha-card"}
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
              aria-pressed={selected === i}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
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

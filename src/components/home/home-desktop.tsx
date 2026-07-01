import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FEATURES, HERO, IMG_BASE, WHAT_WE_DO } from "./content";
import { Parallax } from "./parallax";

/**
 * Pixel-faithful desktop port of the Figma "BTM Draft" homepage (node 282:398).
 *
 * The source is a fixed 1680 × 6064 canvas with absolutely-positioned layers.
 * Every coordinate below is the design's pixel value, converted to container-
 * query width units (`cqw`) by `q()`. The wrapping `<div>` is a query container
 * sized to `min(100%, 1680px)` with the design's aspect ratio, so the whole
 * composition scales uniformly with the viewport — pixel-perfect at 1680px and
 * proportional below, with no JS and no layout shift. Hidden below `xl`, where
 * the mobile reflow layout takes over.
 */

const W = 1680;
// Canvas ends after the Shop section; the videos section renders below as a
// separate responsive block. Reduced from the Figma's 6064 after removing the
// stats band and pulling the lower sections up.
const H = 4700;

/** design px → container-query width units */
const q = (px: number) => `${((px / W) * 100).toFixed(4)}cqw`;

type BoxProps = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  z?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

function Box({ x, y, w, h, z = 10, className, style, children }: BoxProps) {
  return (
    <div
      className={cn("absolute", className)}
      style={{
        left: q(x),
        top: q(y),
        width: w != null ? q(w) : undefined,
        height: h != null ? q(h) : undefined,
        zIndex: z,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Photo({
  x,
  y,
  w,
  h,
  src,
  alt,
  z = 10,
  priority,
  sizes = "(min-width: 1680px) 840px, 50vw",
  className,
  objectPosition,
  parallax,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  alt: string;
  z?: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Focal point for the cover crop. Figma hand-positions some image fills; match them here. */
  objectPosition?: string;
  /** Collage parallax: the photo pans within its frame as it passes through the
   *  viewport (driven by <CollageParallax>). The image is over-scaled so the
   *  pan never exposes the frame edges. */
  parallax?: boolean;
}) {
  const image = (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", parallax && "scale-[1.28]")}
      style={objectPosition ? { objectPosition } : undefined}
    />
  );
  return (
    <Box x={x} y={y} w={w} h={h} z={z} className={cn("overflow-hidden", className)}>
      {parallax ? (
        <div data-parallax className="absolute inset-0">
          {image}
        </div>
      ) : (
        image
      )}
    </Box>
  );
}

type TextProps = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  size: number;
  lh?: number | string;
  font?: "display" | "serif";
  align?: "left" | "center";
  color?: string;
  z?: number;
  className?: string;
  nowrap?: boolean;
  children: React.ReactNode;
};

function Text({
  x,
  y,
  w,
  h,
  size,
  lh,
  font = "serif",
  align = "left",
  color = "#FFFFFF",
  z = 10,
  className,
  nowrap,
  children,
}: TextProps) {
  return (
    <Box
      x={x}
      y={y}
      w={w}
      h={h}
      z={z}
      className={cn(font === "display" ? "font-display" : "font-serif", className)}
      style={{
        fontSize: q(size),
        lineHeight: typeof lh === "number" ? q(lh) : lh ?? "1.2",
        textAlign: align,
        color,
        whiteSpace: nowrap ? "nowrap" : "pre-line",
      }}
    >
      {children}
    </Box>
  );
}

/** Bordered, fully-rounded pill button (matches the design's 70px-radius outline buttons). */
function Pill({
  x,
  y,
  w,
  h,
  href,
  label,
  external,
  className,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  href: string;
  label: string;
  external?: boolean;
  className?: string;
}) {
  const inner = (
    <span
      className="flex h-full w-full items-center justify-center rounded-full border border-white font-display text-white transition-colors hover:bg-white/10"
      style={{ fontSize: q(16) }}
    >
      {label}
    </span>
  );
  return (
    <Box x={x} y={y} w={w} h={h} z={10} className={className}>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
          {inner}
        </a>
      ) : (
        <Link href={href} className="block h-full w-full">
          {inner}
        </Link>
      )}
    </Box>
  );
}

/** Decorative SVG (section flourish, faded wave, play button). */
function Svg({
  x,
  y,
  w,
  h,
  src,
  z = 10,
  className,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  z?: number;
  className?: string;
}) {
  return (
    <Box x={x} y={y} w={w} h={h} z={z} className={cn("select-none", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden className="h-full w-full" />
    </Box>
  );
}

// Feature block layouts, keyed to FEATURES by index.
// Text-side coordinates + the collage rectangles, straight from the Figma tree.
const FILM = FEATURES[0];
const TRAVEL = FEATURES[1];
const COMMUNITY = FEATURES[2];
const SHOP = FEATURES[3];

export function HomeDesktop() {
  return (
    <section className="hidden bg-[#020306] xl:block">
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: `${W} / ${H}`, containerType: "inline-size" }}
      >
        {/* ---- Background photographs ---- */}
        <Photo x={0} y={-40} w={W} h={1120} z={0} src={`${IMG_BASE}/bg-hero.jpg`} alt="Diver in the open ocean" priority sizes="100vw" />
        <Photo x={0} y={1560} w={1681} h={1121} z={0} src={`${IMG_BASE}/bg-mid.jpg`} alt="Manta ray gliding over the reef with a diver" sizes="100vw" />
        <Photo x={0} y={2945} w={W} h={1356} z={0} src={`${IMG_BASE}/bg-bottom.jpg`} alt="Ocean surface" sizes="100vw" />

        {/* ---- Gradient mask overlay that unifies the photos ---- */}
        <Box x={-181.15} y={492} w={2092.78} h={5572} z={1} className="pointer-events-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${IMG_BASE}/mask-bg.svg`} alt="" aria-hidden className="h-full w-full" />
        </Box>

        {/* ---- Shop section bottom fade ----
            Dissolves the lower ocean photo (bg-bottom, ends ~y4301) into the
            section base so there is no hard divider above the videos block. The
            Figma mask's bottom fade was positioned for the original 6064px
            canvas; once the layout was compressed to 4700 it stopped reaching
            full black by the photo's edge — and because that mask is slanted, it
            blacks out the photo's right side before its edge but leaves the left
            side still navy at the rectangular cut, showing a hard line on the
            left. So the gradient reaches solid #020306 ~50px ABOVE the photo's
            edge, covering that last navy strip across the full width, then stays
            opaque all the way down to the section's bottom (y=H). Extending it to
            the canvas edge also covers the faint navy the over-tall mask SVG
            bleeds into the dead zone below the photo, so there is no second edge
            where the overlay would otherwise stop. Sits above the photos and mask
            (z=2) but behind the collage and copy (z≥10), so only the background
            is affected. */}
        <Box
          x={0}
          y={4080}
          w={W}
          h={H - 4080}
          z={2}
          className="pointer-events-none select-none"
          style={{ background: "linear-gradient(to bottom, rgba(2,3,6,0) 0%, rgba(2,3,6,1) 27%)" }}
        />

        {/* The site header (logo + Menu → full-screen sitemap) is rendered once
            by the page, fixed over this canvas, shared with every subpage. */}

        {/* Hero copy — scroll parallax: drifts up and fades over the static
            background for depth, leaving the section gradients untouched.
            Full-canvas, pointer-events-none so the feature buttons stay
            clickable; static under reduced-motion. */}
        <Parallax speed={0.6} className="pointer-events-none absolute inset-0 z-[15]">
          <Text x={388} y={377} w={905} h={120} size={100} lh={120} font="display" nowrap z={15}>
            {HERO.headline}
          </Text>
          <Svg x={831.94} y={509} w={17.06} h={16} src={`${IMG_BASE}/flourish.svg`} z={15} />
          <Text x={490} y={545} w={700} h={96} size={20} lh={32} align="center" z={15}>
            {HERO.intro.join("\n")}
          </Text>
        </Parallax>

        {/* ---- WHAT WE DO ---- */}
        <Text x={683} y={1096} w={315} h={48} size={48} font="display" className="reveal">
          {WHAT_WE_DO.title}
        </Text>
        <Svg x={831} y={1160} w={17.06} h={16} src={`${IMG_BASE}/flourish.svg`} className="reveal" />
        <Text x={617} y={1192} w={446} h={60} size={16} lh={24} align="center" className="reveal">
          {WHAT_WE_DO.subtitle}
        </Text>

        {/* ---- Feature 1: Underwater film & content (text left, collage right) ---- */}
        <Svg x={186} y={1339} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} className="reveal" />
        <Text x={306} y={1382} w={401} h={24} size={16} color="rgba(255,255,255,0.8)" className="reveal">
          {FILM.overline}
        </Text>
        <Text x={250} y={1422} w={443} h={108} size={48} lh={54} font="display" className="reveal">
          {FILM.title}
        </Text>
        <Text x={250} y={1560} w={401} h={72} size={16} lh={24} className="reveal">
          {FILM.body}
        </Text>
        <Text x={250} y={1648} w={401} h={96} size={16} lh={24} className="reveal">
          {FILM.lorem}
        </Text>
        <Pill x={249} y={1784} w={145} h={48} href={FILM.button.href} label={FILM.button.label} className="reveal" />
        {/* collage */}
        <Photo x={737} y={1326} w={458} h={458} src={FILM.images[0].src} alt={FILM.images[0].alt} className="reveal" parallax />
        <Photo x={1210} y={1444} w={345} h={194} src={FILM.images[1].src} alt={FILM.images[1].alt} className="reveal" parallax />
        <Photo x={1210} y={1658} w={277} h={208} src={FILM.images[2].src} alt={FILM.images[2].alt} className="reveal" parallax />
        <Photo x={971} y={1804} w={221} h={124} src={FILM.images[3].src} alt={FILM.images[3].alt} className="reveal" parallax />

        {/* ---- Feature 2: Travel & Expeditions (collage left, text right) ---- */}
        <Photo x={130} y={2262} w={327} h={491} src={TRAVEL.images[1].src} alt={TRAVEL.images[1].alt} className="reveal" parallax />
        <Photo x={477} y={2377} w={471} h={277} src={TRAVEL.images[0].src} alt={TRAVEL.images[0].alt} className="reveal" parallax />
        <Photo x={477} y={2672} w={233} h={229} src={TRAVEL.images[2].src} alt={TRAVEL.images[2].alt} className="reveal" parallax />
        <Svg x={998} y={2306} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} className="reveal" />
        <Text x={1118} y={2349} w={401} h={24} size={16} color="rgba(255,255,255,0.8)" className="reveal">
          {TRAVEL.overline}
        </Text>
        <Text x={1062} y={2389} w={443} h={54} size={48} lh={54} font="display" className="reveal">
          {TRAVEL.title}
        </Text>
        <Text x={1062} y={2527} w={401} h={72} size={16} lh={24} className="reveal">
          {TRAVEL.body}
        </Text>
        <Text x={1062} y={2615} w={401} h={72} size={16} lh={24} className="reveal">
          {TRAVEL.lorem}
        </Text>
        <Pill x={1061} y={2727} w={158} h={48} href={TRAVEL.button.href} label={TRAVEL.button.label} className="reveal" />

        {/* ---- Feature 3: Community Hub (text left, collage right) ---- */}
        <Svg x={186} y={3217} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} className="reveal" />
        <Text x={306} y={3260} w={401} h={24} size={16} color="rgba(255,255,255,0.8)" className="reveal">
          {COMMUNITY.overline}
        </Text>
        <Text x={250} y={3300} w={443} h={54} size={48} lh={54} font="display" className="reveal">
          {COMMUNITY.title}
        </Text>
        <Text x={250} y={3399} w={401} h={48} size={16} lh={24} className="reveal">
          {COMMUNITY.body}
        </Text>
        <Text x={250} y={3463} w={401} h={96} size={16} lh={24} className="reveal">
          {COMMUNITY.lorem}
        </Text>
        <Pill x={249} y={3607} w={162} h={48} href={COMMUNITY.button.href} label={COMMUNITY.button.label} className="reveal" />
        {/* collage */}
        <Photo x={1210} y={3272} w={340} h={509} src={COMMUNITY.images[1].src} alt={COMMUNITY.images[1].alt} className="reveal" parallax />
        <Photo x={850} y={3307} w={341} h={173} src={COMMUNITY.images[0].src} alt={COMMUNITY.images[0].alt} className="reveal" parallax />
        <Photo x={850} y={3500} w={341} h={221} src={COMMUNITY.images[2].src} alt={COMMUNITY.images[2].alt} className="reveal" parallax />

        {/* ---- Feature 4: Shop & Merch (collage left, text right) ---- */}
        <Photo x={130} y={3903} w={341} h={511} src={SHOP.images[1].src} alt={SHOP.images[1].alt} className="reveal" parallax />
        <Photo x={490} y={3953} w={340} h={267} src={SHOP.images[0].src} alt={SHOP.images[0].alt} className="reveal" parallax />
        <Photo x={490} y={4240} w={187} h={280} src={SHOP.images[2].src} alt={SHOP.images[2].alt} className="reveal" parallax />
        <Svg x={942} y={4020} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} className="reveal" />
        <Text x={1062} y={4063} w={401} h={24} size={16} color="rgba(255,255,255,0.8)" className="reveal">
          {SHOP.overline}
        </Text>
        <Text x={1006} y={4103} w={443} h={54} size={48} lh={54} font="display" className="reveal">
          {SHOP.title}
        </Text>
        <Text x={1007} y={4191} w={401} h={48} size={16} lh={24} className="reveal">
          {SHOP.body}
        </Text>
        <Text x={1007} y={4255} w={401} h={96} size={16} lh={24} className="reveal">
          {SHOP.lorem}
        </Text>
        <Pill x={1006} y={4399} w={158} h={48} href={SHOP.button.href} label={SHOP.button.label} className="reveal" />
      </div>
    </section>
  );
}

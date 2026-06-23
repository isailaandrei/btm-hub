import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  FEATURES,
  HERO,
  IMG_BASE,
  LOGIN_HREF,
  NAV_LINKS,
  SOCIAL,
  WHAT_WE_DO,
} from "./content";

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
}) {
  return (
    <Box x={x} y={y} w={w} h={h} z={z} className={cn("overflow-hidden", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        style={objectPosition ? { objectPosition } : undefined}
      />
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
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  href: string;
  label: string;
  external?: boolean;
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
    <Box x={x} y={y} w={w} h={h} z={10}>
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

const NAV_X = [882, 993, 1072, 1202, 1310];

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

        {/* ---- Hero: logo, nav, headline, intro, social rail ---- */}
        <Box x={130} y={37} w={120} h={39} z={20}>
          <Link href="/" aria-label="Behind the Mask home" className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG_BASE}/logo.png`} alt="Behind the Mask" className="h-full w-full object-contain" />
          </Link>
        </Box>

        {NAV_LINKS.map((link, i) => (
          <Text
            key={link.label}
            x={NAV_X[i]}
            y={44}
            size={16}
            font="display"
            z={20}
            className="hover:opacity-70"
          >
            <Link href={link.href}>{link.label}</Link>
          </Text>
        ))}
        <Pill x={1438} y={32} w={112} h={48} href={LOGIN_HREF} label="Log In" />

        <Text x={388} y={377} w={905} h={120} size={100} lh={120} font="display" nowrap z={15}>
          {HERO.headline}
        </Text>
        <Svg x={831.94} y={509} w={17.06} h={16} src={`${IMG_BASE}/flourish.svg`} z={15} />
        <Text x={490} y={545} w={700} h={96} size={20} lh={32} align="center" z={15}>
          {HERO.intro.join("\n")}
        </Text>

        {/* Social rail */}
        <Box x={1614} y={147} w={51} h={16} z={20}>
          <span
            className="block font-serif text-white"
            style={{ fontSize: q(12), writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Follow us
          </span>
        </Box>
        <Box x={1628} y={214} w={20} h={20} z={20}>
          <a href={SOCIAL.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG_BASE}/icon-facebook.png`} alt="" aria-hidden className="h-full w-full object-contain" />
          </a>
        </Box>
        <Box x={1628} y={250} w={20} h={14} z={20}>
          <a href={SOCIAL.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG_BASE}/icon-youtube.png`} alt="" aria-hidden className="h-full w-full object-contain" />
          </a>
        </Box>

        {/* ---- WHAT WE DO ---- */}
        <Text x={683} y={1096} w={315} h={48} size={48} font="display">
          {WHAT_WE_DO.title}
        </Text>
        <Svg x={831} y={1160} w={17.06} h={16} src={`${IMG_BASE}/flourish.svg`} />
        <Text x={617} y={1192} w={446} h={60} size={16} lh={24} align="center">
          {WHAT_WE_DO.subtitle}
        </Text>

        {/* ---- Feature 1: Underwater film & content (text left, collage right) ---- */}
        <Svg x={186} y={1339} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} />
        <Text x={306} y={1382} w={401} h={24} size={16} color="rgba(255,255,255,0.8)">
          {FILM.overline}
        </Text>
        <Text x={250} y={1422} w={443} h={108} size={48} lh={54} font="display">
          {FILM.title}
        </Text>
        <Text x={250} y={1560} w={401} h={72} size={16} lh={24}>
          {FILM.body}
        </Text>
        <Text x={250} y={1648} w={401} h={96} size={16} lh={24}>
          {FILM.lorem}
        </Text>
        <Pill x={249} y={1784} w={145} h={48} href={FILM.button.href} label={FILM.button.label} />
        {/* collage */}
        <Photo x={737} y={1326} w={458} h={458} src={FILM.images[0].src} alt={FILM.images[0].alt} />
        <Photo x={1210} y={1444} w={345} h={194} src={FILM.images[1].src} alt={FILM.images[1].alt} />
        <Photo x={1210} y={1658} w={277} h={208} src={FILM.images[2].src} alt={FILM.images[2].alt} />
        <Photo x={971} y={1804} w={221} h={124} src={FILM.images[3].src} alt={FILM.images[3].alt} />

        {/* ---- Feature 2: Travel & Expeditions (collage left, text right) ---- */}
        <Photo x={130} y={2262} w={327} h={491} src={TRAVEL.images[1].src} alt={TRAVEL.images[1].alt} />
        <Photo x={477} y={2377} w={471} h={277} src={TRAVEL.images[0].src} alt={TRAVEL.images[0].alt} />
        <Photo x={477} y={2672} w={233} h={229} src={TRAVEL.images[2].src} alt={TRAVEL.images[2].alt} />
        <Svg x={998} y={2306} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} />
        <Text x={1118} y={2349} w={401} h={24} size={16} color="rgba(255,255,255,0.8)">
          {TRAVEL.overline}
        </Text>
        <Text x={1062} y={2389} w={443} h={54} size={48} lh={54} font="display">
          {TRAVEL.title}
        </Text>
        <Text x={1062} y={2527} w={401} h={72} size={16} lh={24}>
          {TRAVEL.body}
        </Text>
        <Text x={1062} y={2615} w={401} h={72} size={16} lh={24}>
          {TRAVEL.lorem}
        </Text>
        <Pill x={1061} y={2727} w={158} h={48} href={TRAVEL.button.href} label={TRAVEL.button.label} />

        {/* ---- Feature 3: Community Hub (text left, collage right) ---- */}
        <Svg x={186} y={3217} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} />
        <Text x={306} y={3260} w={401} h={24} size={16} color="rgba(255,255,255,0.8)">
          {COMMUNITY.overline}
        </Text>
        <Text x={250} y={3300} w={443} h={54} size={48} lh={54} font="display">
          {COMMUNITY.title}
        </Text>
        <Text x={250} y={3399} w={401} h={48} size={16} lh={24}>
          {COMMUNITY.body}
        </Text>
        <Text x={250} y={3463} w={401} h={96} size={16} lh={24}>
          {COMMUNITY.lorem}
        </Text>
        <Pill x={249} y={3607} w={162} h={48} href={COMMUNITY.button.href} label={COMMUNITY.button.label} />
        {/* collage */}
        <Photo x={1210} y={3272} w={340} h={509} src={COMMUNITY.images[1].src} alt={COMMUNITY.images[1].alt} />
        <Photo x={850} y={3307} w={341} h={173} src={COMMUNITY.images[0].src} alt={COMMUNITY.images[0].alt} />
        <Photo x={850} y={3500} w={341} h={221} src={COMMUNITY.images[2].src} alt={COMMUNITY.images[2].alt} />

        {/* ---- Feature 4: Shop & Merch (collage left, text right) ---- */}
        <Photo x={130} y={3903} w={341} h={511} src={SHOP.images[1].src} alt={SHOP.images[1].alt} />
        <Photo x={490} y={3953} w={340} h={267} src={SHOP.images[0].src} alt={SHOP.images[0].alt} />
        <Photo x={490} y={4240} w={187} h={280} src={SHOP.images[2].src} alt={SHOP.images[2].alt} />
        <Svg x={942} y={4020} w={90.63} h={145} z={2} src={`${IMG_BASE}/section-icon.svg`} />
        <Text x={1062} y={4063} w={401} h={24} size={16} color="rgba(255,255,255,0.8)">
          {SHOP.overline}
        </Text>
        <Text x={1006} y={4103} w={443} h={54} size={48} lh={54} font="display">
          {SHOP.title}
        </Text>
        <Text x={1007} y={4191} w={401} h={48} size={16} lh={24}>
          {SHOP.body}
        </Text>
        <Text x={1007} y={4255} w={401} h={96} size={16} lh={24}>
          {SHOP.lorem}
        </Text>
        <Pill x={1006} y={4399} w={158} h={48} href={SHOP.button.href} label={SHOP.button.label} />
      </div>
    </section>
  );
}

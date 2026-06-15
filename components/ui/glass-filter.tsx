/**
 * Hidden SVG filter used by the opt-in `.glass-refract` material — now shared by
 * every floating glass surface (bottom tab bar, top navbar pills, the scroll
 * indicator). It bends the blurred backdrop so the glass reads like a real lens
 * that warps the content behind it. Mounted once in the root layout. The
 * displacement is moderate — clearly a glass lens, never a funhouse warp; when
 * WebKit ignores `backdrop-filter: url()` the `@supports` guard in globals.css
 * skips the class entirely and the plain blur stays.
 */
export function GlassFilterDefs() {
  return (
    <svg
      aria-hidden
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
    >
      <defs>
        <filter
          id="glass-refract-filter"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.013"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.4" result="snoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="snoise"
            scale="12"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

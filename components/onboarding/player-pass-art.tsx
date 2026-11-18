import styles from "./player-pass-art.module.css";

type PlayerPassArtProps = { paused: boolean };

const perimeter = "M72 326V44H422V326";
const arc = "M102 326A145 145 0 0 1 392 326";
const approach = "M18 254L116 156V94H294L352 36H476";

/** A quiet court drawing, with moving ink along its architectural lines. */
export function PlayerPassArt({ paused }: PlayerPassArtProps) {
  return <svg className={styles.art} viewBox="0 0 480 320" preserveAspectRatio="xMidYMid slice"
    data-paused={paused} aria-hidden="true" focusable="false">
    <g className={styles.rails}>
      <path d="M32 326V20H448V326M12 68H464M164 0V320M448 130H480"/>
      <path d="M36 316L138 214V134H318L378 74H480"/>
      <path d="M218 320V236H336V320M232 222H322"/>
      <circle cx="277" cy="236" r="108"/>
      <path d="M276 15V25M271 20H281M443 130H453M448 125V135"/>
    </g>
    <g className={styles.court}>
      <path d={perimeter} pathLength="100"/>
      <path d={arc} pathLength="100"/>
      <path d="M203 326V218H291V326M203 218A44 44 0 0 1 291 218M247 44V118M247 288V320" pathLength="100"/>
      <circle cx="247" cy="280" r="7"/>
      <path d="M231 268H263" pathLength="100"/>
    </g>
    <path className={styles.approach} d={approach}/>
    <g className={styles.flow}>
      <path className={styles.perimeterFlow} d={perimeter} pathLength="100"/>
      <path className={styles.arcFlow} d={arc} pathLength="100"/>
      <path className={styles.approachFlow} d={approach} pathLength="100"/>
    </g>
    <g className={styles.register}>
      <circle cx="422" cy="44" r="2"/>
      <circle cx="352" cy="36" r="2"/>
      <path d="M400 158H422M410 166H422M416 174H422"/>
    </g>
  </svg>;
}

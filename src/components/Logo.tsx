import type { SVGProps } from "react";
import { LOGO_VIEWBOX, MARK_PATH, MARK_VIEWBOX, WORDMARK_PATH } from "@/config/logo";
import { siteConfig } from "@/config/site";

type Props = SVGProps<SVGSVGElement>;

/** Знак-«точка» из логотипа. */
export function LogoMark(props: Props) {
  return (
    <svg viewBox={MARK_VIEWBOX} fill="currentColor" aria-hidden {...props}>
      <path fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/** Полный логотип: знак + надпись VAPE ТОЧКА. */
export function Logo(props: Props) {
  return (
    <svg viewBox={LOGO_VIEWBOX} fill="currentColor" role="img" aria-label={siteConfig.displayName} {...props}>
      <path fillRule="evenodd" d={MARK_PATH + WORDMARK_PATH} />
    </svg>
  );
}

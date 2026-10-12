import { ImageResponse } from "next/og";
import { LOGO_VIEWBOX, MARK_PATH, WORDMARK_PATH } from "@/config/logo";
import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.displayName} — каталог`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Картинка-превью при отправке ссылки в Telegram, Instagram и т.п. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
        }}
      >
        <svg width="760" height="291" viewBox={LOGO_VIEWBOX}>
          <path fill="#ffffff" fillRule="evenodd" d={MARK_PATH + WORDMARK_PATH} />
        </svg>
      </div>
    ),
    size,
  );
}

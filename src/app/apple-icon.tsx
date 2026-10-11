import { ImageResponse } from "next/og";
import { MARK_PATH, MARK_VIEWBOX } from "@/config/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <svg width="76" height="118" viewBox={MARK_VIEWBOX}>
          <path fill="#ffffff" fillRule="evenodd" d={MARK_PATH} />
        </svg>
      </div>
    ),
    size,
  );
}

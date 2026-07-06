import { ImageResponse } from "next/og";
import { HOME_TITLE, SITE_NAME } from "@/lib/seo";

export const runtime = "edge";

// Default social-share card (1200x630). Previously the metadata pointed at
// /icon.ico — a file that doesn't exist and, being an .ico, was never a valid
// OG image — so every link preview rendered blank. This generates a real,
// correctly-sized branded card with no binary asset to maintain.
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.slice(0, 120) || HOME_TITLE;
  const subtitle =
    searchParams.get("subtitle")?.slice(0, 160) ||
    "Personalized basketball sneaker recommendations & structured specs.";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0a0a0a 0%, #171717 100%)",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "6px",
              background: "#ffffff",
            }}
          />
          <div style={{ color: "#a3a3a3", fontSize: "30px", letterSpacing: "0.04em" }}>
            {SITE_NAME}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: "68px",
              fontWeight: 700,
              lineHeight: 1.05,
              maxWidth: "1000px",
            }}
          >
            {title}
          </div>
          <div style={{ color: "#d4d4d4", fontSize: "34px", lineHeight: 1.3, maxWidth: "960px" }}>
            {subtitle}
          </div>
        </div>
        <div style={{ color: "#737373", fontSize: "26px" }}>snkrfeature.com</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

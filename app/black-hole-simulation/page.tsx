import type { Metadata } from "next";

const title = "Black hole physics simulation";
const description =
  "Physical simulation for understanding gravitational lensing and other black-hole properties, including spin, orbits, and tidal effects.";
const url = "https://artifact.cb341.dev/black-hole-simulation";
const image =
  "https://artifact.cb341.dev/black-hole-simulation-static/assets/og-black-hole-schwarzschild-nasa-v1.jpg";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: {
    type: "website",
    url,
    siteName: "Black hole simulator",
    title,
    description,
    images: [{ url: image, width: 1200, height: 630, alt: "A black hole and accretion disk against a star field." }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image],
  },
};

export default function BlackHoleSimulation() {
  return (
    <iframe
      className="simulation-frame"
      src="/black-hole-simulation-static/index.html"
      title="Interactive black hole simulation"
      allowFullScreen
    />
  );
}

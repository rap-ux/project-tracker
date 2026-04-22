import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "Switchboard — Totally Wired Electric",
    short_name:       "Switchboard",
    description:      "Project coordination for Totally Wired Electric",
    start_url:        "/",
    scope:            "/",
    display:          "standalone",
    orientation:      "portrait",
    background_color: "#101010",
    theme_color:      "#00BAD6",
    categories:       ["business", "productivity"],
    icons: [
      {
        src:     "/switchboard-icon.svg",
        sizes:   "any",
        type:    "image/svg+xml",
        purpose: "any",
      },
      {
        src:     "/switchboard-icon.svg",
        sizes:   "any",
        type:    "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

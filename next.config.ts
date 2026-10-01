import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },
  // Older TPL URLs: the /model/states/ prefix (state pages now sit at /model/oh) and the
  // path-only sub-tabs. The two that carry a query (/model/state, /model/district) are pages.
  async redirects() {
    return [
      { source: "/model/states", destination: "/model", permanent: true },
      { source: "/model/states/:abbr", destination: "/model/:abbr", permanent: true },
      { source: "/model/table", destination: "/model", permanent: false },
      { source: "/model/districtTable", destination: "/model#districts", permanent: false },
      { source: "/model/war", destination: "/model/candidates", permanent: false },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use webpack instead of Turbopack for stable dev behavior on Windows
  // Do NOT include turbopack config when using webpack - it causes conflicts

  experimental: {
    instrumentationHook: true,
  },

  // Docker / self-hosted: produces a minimal server bundle (see DEPLOYMENT.md)
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,

  // Production optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  
  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://www.googleapis.com https://www.google-analytics.com",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  
  // Ensure Node-only modules are handled correctly
  webpack: (config, { isServer }) => {
    // Exclude server-only native modules from client-side bundling
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        child_process: false,
        path: false,
      };
    }
    
    // Keep server-only externals in the server bundle
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("node-cron");
    }
    
    return config;
  },
};

module.exports = nextConfig;


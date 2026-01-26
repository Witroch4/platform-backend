/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "pdf-parse"],

  // Production optimizations
  productionBrowserSourceMaps: false,
  generateEtags: false,
  compress: true,

  // Build optimizations
  experimental: {
    // optimizeCss disabled due to missing critters dependency
  },

  // Turbopack configuration (moved from experimental.turbo)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    unoptimized: true, // Desabilita otimização para resolver problemas em produção
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  webpack: (config, { isServer }) => {
    // Configuração para resolver o alias @/
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': '.'
    }

    // Fallbacks para módulos Node.js no cliente
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        dns: false,
      }

      // Evitar bundling de pdf-parse no cliente
      config.externals = config.externals || [];
      config.externals.push('pdf-parse');
    }

    return config
  },

  async headers() {
    return [
      {
        source: "/api/chatwitia/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin",      value: "*" },
          { key: "Access-Control-Allow-Methods",     value: "GET,DELETE,PATCH,POST,PUT" },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
          }
        ]
      }
    ]
  },

  env: {
    NEXT_PUBLIC_URL:                    process.env.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_INSTAGRAM_APP_ID:       process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID,
    NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI: process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  }
}

export default nextConfig

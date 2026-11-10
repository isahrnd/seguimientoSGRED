const API = process.env.API_INTERNA || "http://127.0.0.1:4310";

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  transpilePackages: ["antd", "@ant-design/icons"],
  async rewrites() {
    // El navegador solo habla con este origen; la API queda en la red interna.
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
  async headers() {
    // Nada de lo servido se guarda en cachés compartidas ni se restaura con «Atrás» tras cerrar sesión.
    return [{
      source: "/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ],
    }];
  },
};

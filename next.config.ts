import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STATIC_EXPORT=1 gera um site 100% estático em ./out (pronto para
  // hospedar em qualquer serviço, ex. netlify.app/drop). Por defeito usa
  // "standalone" para o ambiente de pré-visualização.
  output: process.env.STATIC_EXPORT === "1" ? "export" : "standalone",
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

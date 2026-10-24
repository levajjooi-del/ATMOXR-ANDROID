/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportação 100% estática: o APK embute a pasta `out/` nos assets Android.
  output: 'export',
  // StrictMode monta efeitos 2x em dev — ruim p/ câmera/Three. Desligado.
  reactStrictMode: false,
  images: { unoptimized: true },
};

module.exports = nextConfig;

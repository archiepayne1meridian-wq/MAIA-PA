import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist's legacy Node build resolves its worker via a dynamic
  // require.resolve() at runtime — bundling it breaks that resolution
  // (Turbopack/webpack rewrite the path). Keeping it external lets Node
  // resolve it natively, same reason for mammoth/xlsx's own binary-ish assets.
  serverExternalPackages: ["pdfjs-dist", "mammoth", "xlsx"],
};

export default nextConfig;

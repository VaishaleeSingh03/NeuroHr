/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
};

// standalone is for Docker/Node hosting only — breaks Netlify's Next.js runtime
if (process.env.NETLIFY !== 'true' && !process.env.VERCEL) {
  nextConfig.output = 'standalone';
}

module.exports = nextConfig;

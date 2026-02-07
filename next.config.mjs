/** @type {import('next').NextConfig} */
const portalVersion =
  process.env.NEXT_PUBLIC_PORTAL_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  ""

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_PORTAL_VERSION: portalVersion,
  },
 
}

export default nextConfig

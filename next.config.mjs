/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR: 빌드 폴더를 바꾼다. 같은 폴더에서 배포용 빌드(next build)와 개발 서버를 함께 돌릴 때
  //   서로 .next 를 덮어쓰지 않게 (예: NEXT_DIST_DIR=.next-dev npm run dev)
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;

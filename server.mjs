/**
 * Next.js 커스텀 서버.
 * 하나의 Node 프로세스 / 하나의 포트에서
 *   - Next.js 페이지 (화면)
 *   - socket.io (실시간 게임 서버)
 * 를 함께 돌린다. Vercel 같은 서버리스 환경은 WebSocket 을 유지할 수 없으므로
 * 이 파일을 직접 실행할 수 있는 곳(Railway, Render, Fly.io, VPS, Docker 등)에 배포해야 한다.
 *
 *   개발: npm run dev      (node server.mjs --dev)
 *   배포: npm run build && npm start
 */
import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import { attachGameServer } from './server/socket.js';

const dev = process.argv.includes('--dev');
// 테스트 모드(레벨 건너뛰기, 아이템/엔티티 소환 등): 개발 서버는 기본 ON, 배포 서버는 BACKROOMS_TEST=1 일 때만
const testMode = process.env.BACKROOMS_TEST ? process.env.BACKROOMS_TEST === '1' : dev;
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();
await app.prepare();

let game = null;
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(game.health()));
    return;
  }
  handle(req, res);
});

// destroyUpgrade:false → socket.io 가 자기 경로가 아닌 WebSocket(Next 개발용 HMR)을 끊지 않도록 함
const io = new Server(httpServer, { destroyUpgrade: false });
game = attachGameServer(io, { testMode });

httpServer.listen(port, () => {
  console.log(`Backrooms (Next.js ${dev ? 'dev' : 'prod'} + socket.io) ready on http://localhost:${port}${testMode ? '  [TEST MODE: \` 키]' : ''}`);
});

// Render 무료 플랜은 15분간 요청이 없으면 서버를 재운다.
// 10분마다 자기 공개 주소(/health)를 호출해서 계속 깨어 있게 한다. (KEEP_AWAKE=0 이면 끔)
const publicUrl = process.env.RENDER_EXTERNAL_URL;
if (!dev && publicUrl && process.env.KEEP_AWAKE !== '0') {
  setInterval(() => {
    fetch(`${publicUrl}/health`).catch(e => console.warn('keep-awake ping 실패:', e.message));
  }, 10 * 60 * 1000).unref();
  console.log(`keep-awake: 10분마다 ${publicUrl}/health 호출`);
}

// 모델 편집기(tools/model-editor.html) 만들기:
//   template 에 게임의 모델 빌더(game/client/three/models/build.js)와 모델 데이터(level0.json)를 끼워 넣는다.
//   모델 데이터나 빌더를 바꾸면 다시 돌린다:  node tools/build-model-editor.mjs
// 만든 HTML 은 더블클릭으로 연다 (three.js 는 인터넷 CDN 에서 받는다).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const tpl = fs.readFileSync(path.join(here, 'model-editor.template.html'), 'utf8');
const build = fs.readFileSync(path.join(root, 'game/client/three/models/build.js'), 'utf8');
const models = fs.readFileSync(path.join(root, 'game/client/three/models/level0.json'), 'utf8');
JSON.parse(models);   // 깨진 JSON 이면 여기서 멈춘다
const stamp = crypto.createHash('sha1').update(models).digest('hex').slice(0, 8);

const safe = s => s.replace(/<\/script/gi, '<\\/script');
let html = tpl
  .replace("/*__BUILD_JS__*/''", () => safe(JSON.stringify(build)))
  .replace('/*__MODELS_JSON__*/{}', () => safe(models.trim()))
  .replace("/*__STAMP__*/''", () => JSON.stringify(stamp));
if (html.includes('__BUILD_JS__') || html.includes('__MODELS_JSON__') || html.includes('__STAMP__')) throw new Error('템플릿 자리표시자를 못 바꿨다');
const out = path.join(here, 'model-editor.html');
fs.writeFileSync(out, html);
console.log(`만들었다: ${out} (${Math.round(html.length / 1024)}KB, 모델 데이터 ${stamp})`);

import DeviceGate from '../components/DeviceGate';

// 휴대폰이면 안내 사이트, 컴퓨터·태블릿이면 게임
export default function Page() {
  return <DeviceGate />;
}

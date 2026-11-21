# Blender MCP 애드온(포트 9876)에 파이썬 코드를 보내 실행한다 (MCP 서버가 쓰는 것과 같은 프로토콜)
#   python bsend.py script.py [--ping]
import json, socket, sys

def send(cmd, timeout=600):
    s = socket.create_connection(('127.0.0.1', 9876), timeout=timeout)
    s.sendall(json.dumps(cmd).encode('utf-8'))
    buf = b''
    while True:
        chunk = s.recv(65536)
        if not chunk: break
        buf += chunk
        try:
            res = json.loads(buf.decode('utf-8')); break
        except Exception:
            continue
    s.close()
    return res

if __name__ == '__main__':
    if sys.argv[1] == '--ping':
        print(send({'type': 'ping'}))
    else:
        code = open(sys.argv[1], encoding='utf-8').read()
        res = send({'type': 'execute_code', 'params': {'code': code}})
        if res.get('status') == 'error':
            msg = res.get('message', '')
            try: msg = json.loads(msg).get('traceback', msg)
            except Exception: pass
            print('ERROR:', msg); sys.exit(1)
        r = res.get('result', res)
        print(r.get('result', r) if isinstance(r, dict) else r)

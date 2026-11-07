'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 인게임 / 대기방 채팅.
 *  - 채팅 키(기본 ENTER)를 누르면 입력창이 열리고, ENTER 로 보내고 닫힌다. ESC 로 취소.
 *  - 닫혀 있을 땐 최근 메시지만 잠깐 보였다가 흐려진다.
 * props: { messages: [{ key, name, color, text, dead, at }], open, onSend(text), onClose(), colorHex(c) }
 */
export default function ChatBox({ messages, open, onSend, onClose, colorHex }) {
  const [text, setText] = useState('');
  const [, tick] = useState(0);
  const input = useRef(null), list = useRef(null);
  useEffect(() => { if (open) { setText(''); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(id); }, []);   // 오래된 메시지 흐려지게
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages, open]);

  const now = performance.now();
  const shown = open ? messages.slice(-30) : messages.filter(m => now - m.at < 10000).slice(-6);
  if (!open && !shown.length) return null;
  const send = () => { const t = text.trim(); if (t) onSend(t); onClose(); };
  return (
    <div className={`chat-box${open ? ' open' : ''}`} onPointerDown={e => open && e.stopPropagation()}>
      <div className="chat-list" ref={list}>
        {shown.map(m => (
          <div key={m.key} className="chat-line" style={{ opacity: open ? 1 : Math.max(0, Math.min(1, (10000 - (now - m.at)) / 2000)) }}>
            <b style={{ color: colorHex(m.color) }}>{m.dead ? '(관전) ' : ''}{m.name}</b>: {m.text}
          </div>
        ))}
      </div>
      {open && (
        <input ref={input} className="chat-input" value={text} maxLength={120} placeholder="메시지 입력 (ENTER 보내기 · ESC 닫기)"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); send(); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }}
          onBlur={() => setTimeout(onClose, 100)} />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

// 可搜索的机场选择器：支持机场名称 / 机场代码 / 城市 关键字过滤
export default function AirportSelect({ airports, value, onChange, placeholder }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const wrapRef = useRef(null);

  // 外部 value 变化时同步显示机场名
  useEffect(() => {
    const s = airports.find((x) => x.id === value);
    setText(s ? `${s.name}（${s.code}）` : '');
  }, [value, airports]);

  // 点击下拉框外部时关闭
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const match = (a, kw) => {
    const k = kw.toLowerCase();
    return (
      a.name.toLowerCase().includes(k) ||
      (a.code || '').toLowerCase().includes(k) ||
      (a.city || '').toLowerCase().includes(k)
    );
  };

  const onInput = (e) => {
    const t = e.target.value;
    setText(t);
    setOpen(true);
    const kw = t.trim();
    if (!kw) {
      onChange('');
      setFiltered([]);
      return;
    }
    setFiltered(airports.filter((a) => match(a, kw)));
  };

  const pick = (s) => {
    onChange(s.id);
    setText(`${s.name}（${s.code}）`);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) pick(filtered[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="station-select" ref={wrapRef}>
      <input
        className="input"
        value={text}
        onChange={onInput}
        onFocus={() => {
          setOpen(true);
          setFiltered(airports.slice(0, 20));
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder || '输入机场名称或代码搜索'}
        autoComplete="off"
      />
      {open && (
        <div className="station-drop">
          {filtered.length === 0 && <div className="station-drop-empty">无匹配机场</div>}
          {filtered.map((s) => (
            <div
              key={s.id}
              className={`station-option${value === s.id ? ' selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              {s.name}（{s.code}）
              {s.city ? <span className="muted"> · {s.city}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

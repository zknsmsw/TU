import { useEffect, useRef, useState } from 'react';

// 可搜索的车站选择器：输入站名过滤，点击或回车选择
export default function StationSelect({ stations, value, onChange, placeholder }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const wrapRef = useRef(null);

  // 外部 value 变化时同步显示站名
  useEffect(() => {
    const s = stations.find((x) => x.id === value);
    setText(s ? s.name : '');
  }, [value, stations]);

  // 点击下拉框外部时关闭
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
    setFiltered(stations.filter((s) => s.name.includes(kw)));
    const exact = stations.find((s) => s.name === kw);
    if (exact) {
      onChange(exact.id);
    } else {
      onChange('');
    }
  };

  const pick = (s) => {
    onChange(s.id);
    setText(s.name);
    setOpen(false);
  };

  const onBlur = () => {
    const kw = text.trim();
    const exact = stations.find((s) => s.name === kw);
    if (exact) {
      onChange(exact.id);
      setText(exact.name);
    } else if (!value) {
      const s = stations.find((x) => x.id === value);
      setText(s ? s.name : '');
    }
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
        onBlur={onBlur}
        onFocus={() => {
          setOpen(true);
          setFiltered(stations.slice(0, 20));
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder || '输入站名搜索'}
        autoComplete="off"
      />
      {open && (
        <div className="station-drop">
          {filtered.length === 0 && <div className="station-drop-empty">无匹配站点</div>}
          {filtered.map((s) => (
            <div
              key={s.id}
              className={`station-option${value === s.id ? ' selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

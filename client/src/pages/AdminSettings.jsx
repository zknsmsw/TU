import { useEffect, useState } from 'react';
import api from '../api.js';

// 后台 · 票务设置：火车默认站间票价 + 退票手续费
export default function AdminSettings() {
  const [msg, setMsg] = useState(null);
  const [defaultFare, setDefaultFare] = useState('');
  const [refundType, setRefundType] = useState('none');
  const [refundValue, setRefundValue] = useState('');

  const loadSettings = () => {
    api
      .get('/settings')
      .then((res) => {
        const t = (res.data && res.data.train) || {};
        setDefaultFare(t.defaultFare !== undefined ? String(t.defaultFare) : '');
        const r = (res.data && res.data.refund) || {};
        setRefundType(r.type || 'none');
        setRefundValue(r.value !== undefined ? String(r.value) : '');
      })
      .catch(() => {});
  };
  useEffect(loadSettings, []);

  const saveFare = async () => {
    setMsg(null);
    if (defaultFare === '' || isNaN(Number(defaultFare)) || Number(defaultFare) < 0) {
      setMsg({ type: 'error', text: '请输入有效的默认票价' });
      return;
    }
    try {
      const res = await api.put('/settings', { train: { defaultFare } });
      setMsg({ type: 'info', text: res.message || '已保存' });
      loadSettings();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const saveRefund = async () => {
    setMsg(null);
    let value = 0;
    if (refundType !== 'none') {
      value = Number(refundValue);
      if (refundValue === '' || isNaN(value) || value < 0) {
        setMsg({ type: 'error', text: '请输入有效的手续费数值' });
        return;
      }
    }
    try {
      const res = await api.put('/settings', { refund: { type: refundType, value } });
      setMsg({ type: 'info', text: res.message || '已保存' });
      loadSettings();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div>
      <h2>票务设置</h2>

      <div className="admin-panel">
        <h3>火车默认站间票价</h3>
        <p className="settings-tip">某两个站之间没有单独设置票价时，使用这个默认票价。</p>
        {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}
        <div className="admin-row">
          <input
            className="input fare-input"
            placeholder="默认票价"
            value={defaultFare}
            onChange={(e) => setDefaultFare(e.target.value)}
          />
          <span className="muted">摩拉</span>
          <button className="btn" onClick={saveFare}>
            保存
          </button>
        </div>
      </div>

      <div className="admin-panel">
        <h3>退票手续费</h3>
        <p className="settings-tip">已支付订单退票时扣除的手续费；未设置则免费退票。</p>
        <div className="admin-row">
          <select
            className="input"
            value={refundType}
            onChange={(e) => setRefundType(e.target.value)}
          >
            <option value="none">不收手续费</option>
            <option value="fixed">定额</option>
            <option value="percent">百分比</option>
          </select>
          {refundType !== 'none' && (
            <input
              className="input fare-input"
              placeholder={refundType === 'fixed' ? '金额（摩拉）' : '百分比（%）'}
              value={refundValue}
              onChange={(e) => setRefundValue(e.target.value)}
            />
          )}
          {refundType === 'none' && <span className="muted">退票不扣任何费用</span>}
          <button className="btn" onClick={saveRefund}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

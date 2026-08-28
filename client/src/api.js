import axios from 'axios';
import { useAuth } from './store.js';

// 会话令牌由服务端 HttpOnly Cookie 携带（withCredentials 兼容跨域场景），
// 前端不再需要也不应该接触 token。
const api = axios.create({ baseURL: '/api', withCredentials: true });

// 响应拦截：统一取出 data，出错时抛出可读的错误信息
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    // 登录态失效（过期/改密/账号变动）：清除本地用户状态
    if (err?.response?.status === 401) {
      useAuth.getState().logout();
    }
    const message = err?.response?.data?.message || '网络错误，请确认后端已启动';
    return Promise.reject(new Error(message));
  }
);

export default api;

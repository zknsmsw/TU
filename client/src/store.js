import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// 登录状态：只保存用户信息（非敏感数据）。
// 会话令牌存放在服务端设置的 HttpOnly Cookie 中，前端 JS 无法读取，
// 即使发生 XSS 也无法窃取登录态。
export const useAuth = create(
  persist(
    (set) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null })
    }),
    {
      name: 'tt_auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user })
    }
  )
);

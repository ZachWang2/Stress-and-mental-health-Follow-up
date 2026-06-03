import { useState } from "react";
import { isSupabaseConfigured, supabase, supabaseConfigStatus } from "../lib/supabase.js";

export default function AuthPanel({ session, busy, onSignOut, onMessage }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function notify(text) {
    setMessage(text);
    onMessage(text);
  }

  async function submit(event) {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      notify("请先配置 Supabase 环境变量");
      return;
    }
    setLoading(true);
    notify(mode === "signin" ? "正在登录..." : "正在注册...");
    try {
      const { error } = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (error) throw error;
      notify(mode === "signin" ? "登录成功，正在读取云端数据" : "注册完成，请按 Supabase 邮件确认设置继续");
    } catch (error) {
      notify(`登录模块提示：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!isSupabaseConfigured) {
    const missing = [
      !supabaseConfigStatus.hasUrl && "VITE_SUPABASE_URL",
      !supabaseConfigStatus.hasPublishableKey && !supabaseConfigStatus.hasAnonKey && "VITE_SUPABASE_PUBLISHABLE_KEY 或 VITE_SUPABASE_ANON_KEY",
    ].filter(Boolean).join("、");

    return (
      <section className="auth-panel warning">
        <div>
          <p className="eyebrow">Cloud Sync</p>
          <h2>Supabase 未配置</h2>
          <p>当前构建缺少：{missing || "未知变量"}。请在 Vercel 环境变量里配置后重新部署。</p>
        </div>
      </section>
    );
  }

  if (session) {
    return (
      <section className="auth-panel connected">
        <div>
          <p className="eyebrow">Cloud Sync</p>
          <h2>已连接云端</h2>
          <p>{session.user.email} 的记录会同步到 Supabase。当前版本仍保留本地缓存，断网时不至于丢失页面数据。</p>
        </div>
        <button type="button" onClick={onSignOut} disabled={busy}>退出登录</button>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <div>
        <p className="eyebrow">Cloud Sync</p>
        <h2>登录后开启跨设备记录</h2>
        <p>同一个账号登录后，日常记录、周评、SCARED 和树洞内容会保存到 Supabase。</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="邮箱" required />
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="密码，至少 6 位" minLength="6" required />
        <div className="auth-actions">
          <button className="primary" type="submit" disabled={loading}>{loading ? "处理中..." : mode === "signin" ? "登录" : "注册"}</button>
          <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "切换注册" : "切换登录"}
          </button>
        </div>
        {message && <p className="auth-message" aria-live="polite">{message}</p>}
      </form>
    </section>
  );
}

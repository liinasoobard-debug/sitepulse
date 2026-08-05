import LoginForm from "@/app/login/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  return <main className="app-shell"><section className="launcher-card" style={{ alignSelf: "center" }}>
    <div className="brand-row"><div className="brand-mark">SP</div><div><p className="eyebrow">SitePulse</p><h1>Welcome to SitePulse</h1></div></div>
    <p style={{ color: "#5f6b76", lineHeight: 1.6 }}>Sign in to your account or create one to get started.</p>
    {!configured ? <div role="alert" style={{ padding: 14, border: "1px solid #d39b22", borderRadius: 10, background: "#fff8e7", color: "#684b0c" }}><strong>Supabase setup required.</strong><p style={{ marginBottom: 0 }}>Replace the placeholder environment variables with your Supabase project URL and publishable key, then restart SitePulse.</p></div> : <LoginForm />}
  </section></main>;
}

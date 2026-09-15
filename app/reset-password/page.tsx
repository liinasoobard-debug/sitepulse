import ResetPasswordForm from "@/app/reset-password/ResetPasswordForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function ResetPasswordPage() {
  const configured = isSupabaseConfigured();
  return <main className="app-shell"><section className="launcher-card" style={{ alignSelf: "center" }}>
    <div className="brand-row"><div className="brand-mark">SP</div><div><p className="eyebrow">SitePulse</p><h1>Reset your password</h1></div></div>
    {!configured ? <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>Supabase setup required. Contact your administrator.</p> : <ResetPasswordForm />}
  </section></main>;
}

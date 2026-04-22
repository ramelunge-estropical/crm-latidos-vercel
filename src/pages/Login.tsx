import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logoHeart from "@/assets/logo-heart.png";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

// Fallback: email lookup en colaboradores (mientras no haya Google Auth configurado)
async function loginByEmail(email: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("colaboradores")
    .select("id, nombre, activo")
    .ilike("email", email.trim())
    .single();
  if (!data || data.activo === false) return null;
  return data.id;
}

export default function Login() {
  const [loading,     setLoading]     = useState(false);
  const [emailMode,   setEmailMode]   = useState(false);
  const [email,       setEmail]       = useState("");

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/?auth=google`,
        scopes: "email profile",
      },
    });
    if (error) {
      toast.error("Error al conectar con Google");
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const id = await loginByEmail(email);
    if (id) {
      const expiry = Date.now() + 8 * 60 * 60 * 1000; // 8 horas
      localStorage.setItem("mis_gestiones_colaborador", id);
      localStorage.setItem("crm_session_expiry", String(expiry));
      window.location.href = "/";
    } else {
      toast.error("No se encontró un colaborador activo con ese email");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 shadow-sm">
            <img src={logoHeart} alt="Latidos" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Latidos CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">Estropical · Travel Operating System</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-base font-semibold text-foreground">Bienvenido</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Ingresá con tu cuenta corporativa</p>
          </div>

          {/* Google button */}
          <Button
            className="w-full gap-2.5 h-10"
            variant="outline"
            onClick={handleGoogle}
            disabled={loading}
          >
            {loading && !emailMode ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continuar con Google
          </Button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground">o</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email fallback */}
          {emailMode ? (
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="tu@estropical.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
                autoFocus
              />
              <Button
                className="w-full h-9 text-sm"
                onClick={handleEmailLogin}
                disabled={loading || !email.trim()}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ingresar"}
              </Button>
              <button
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setEmailMode(false)}
              >
                Volver
              </button>
            </div>
          ) : (
            <button
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              onClick={() => setEmailMode(true)}
            >
              <Mail className="w-3.5 h-3.5" />
              Ingresar con email corporativo
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-[11px] text-muted-foreground">
            Próximamente: inicio de sesión con Azure Active Directory
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            Solo colaboradores registrados pueden acceder
          </p>
        </div>
      </div>
    </div>
  );
}

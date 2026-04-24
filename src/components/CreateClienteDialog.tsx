import { useState, useRef, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Mic, MicOff, Loader2, User, Building2, Sparkles, Save, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TipoCliente = "natural" | "juridica";

interface FormData {
  tipo_cliente: TipoCliente;
  canal_contacto: string;
  nombre_completo: string;
  razon_social: string;
  nit: string;
  contacto_nombre: string;
  contacto_cargo: string;
  documento_tipo: string;
  documento_numero: string;
  email: string;
  email_secundario: string;
  telefono: string;
  telefono_secundario: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  fecha_nacimiento: string;
  nacionalidad: string;
  ciudad: string;
  pais: string;
  estado: string;
  profesion: string;
  estado_civil: string;
  asesor_nombre: string;
  club_viajes: boolean;
  espacio_a_bordo: boolean;
  pases_a_bordo: string;
  dias_credito: string;
  notas_rapidas: string;
}

const CANALES_CONTACTO = [
  'WhatsApp', 'Telefonía', 'Instagram', 'Facebook',
  'Messenger', 'Tik Tok', 'Correo', 'Presencial',
];

const EMPTY_FORM: FormData = {
  tipo_cliente:        "natural",
  canal_contacto:      "",
  nombre_completo:     "",
  razon_social:        "",
  nit:                 "",
  contacto_nombre:     "",
  contacto_cargo:      "",
  documento_tipo:      "CI",
  documento_numero:    "",
  email:               "",
  email_secundario:    "",
  telefono:            "",
  telefono_secundario: "",
  instagram:           "",
  facebook:            "",
  tiktok:              "",
  fecha_nacimiento:    "",
  nacionalidad:        "Boliviana",
  ciudad:              "",
  pais:                "Bolivia",
  estado:              "activo",
  profesion:           "",
  estado_civil:        "",
  asesor_nombre:       "",
  club_viajes:         false,
  espacio_a_bordo:     false,
  pases_a_bordo:       "0",
  dias_credito:        "",
  notas_rapidas:       "",
};

// ─── AI voice fill ────────────────────────────────────────────────────────────

async function transcribeAndFill(audioBlob: Blob, tipo: TipoCliente): Promise<Partial<FormData>> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) throw new Error("Falta VITE_OPENAI_API_KEY en las variables de entorno");

  // 1. Transcribir con Whisper
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("language", "es");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!whisperRes.ok) throw new Error("Error al transcribir audio");
  const { text } = await whisperRes.json();

  // 2. Extraer campos estructurados con GPT
  const systemPrompt = tipo === "natural"
    ? `Eres un asistente de CRM. Extrae información de clientes de Bolivia a partir de texto dictado.
Devuelve SOLO un JSON válido con estos campos (omití los que no se mencionen):
nombre_completo, documento_tipo (CI/Pasaporte/RUC), documento_numero, email, telefono,
fecha_nacimiento (YYYY-MM-DD), nacionalidad, ciudad, pais, profesion, estado_civil,
asesor_nombre, notas_rapidas.`
    : `Eres un asistente de CRM. Extrae información de empresas de Bolivia a partir de texto dictado.
Devuelve SOLO un JSON válido con estos campos (omití los que no se mencionen):
razon_social, nombre_completo (nombre corto), nit, contacto_nombre, contacto_cargo,
email, telefono, ciudad, pais, asesor_nombre, notas_rapidas.`;

  const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: text },
      ],
    }),
  });
  if (!gptRes.ok) throw new Error("Error al procesar con GPT");
  const gptData = await gptRes.json();
  return JSON.parse(gptData.choices[0].message.content) as Partial<FormData>;
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface CreateClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNombre?: string;
  initialTelefono?: string;
  initialCanal?: string;
  clienteId?: string;
  clienteData?: Record<string, any>;
  onCreated?: (clienteId: string, nombre: string, telefono?: string | null, email?: string | null) => void;
}

export function CreateClienteDialog({ open, onOpenChange, initialNombre = "", initialTelefono = "", initialCanal = "", clienteId, clienteData, onCreated }: CreateClienteDialogProps) {
  const isEditMode = !!clienteId;
  const queryClient = useQueryClient();

  const { data: colaboradores = [] } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ["colaboradores-list"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("colaboradores").select("id, nombre").order("nombre");
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const [form, setForm] = useState<FormData>({
    ...EMPTY_FORM,
    nombre_completo: initialNombre,
    telefono:        initialTelefono,
    canal_contacto:  initialCanal,
  });
  useEffect(() => {
    if (open) {
      if (isEditMode && clienteData) {
        setForm({
          tipo_cliente:        clienteData.tipo_cliente        ?? "natural",
          canal_contacto:      clienteData.canal_contacto      ?? "",
          nombre_completo:     clienteData.nombre_completo     ?? "",
          razon_social:        clienteData.razon_social        ?? "",
          nit:                 clienteData.nit                 ?? "",
          contacto_nombre:     clienteData.contacto_nombre     ?? "",
          contacto_cargo:      clienteData.contacto_cargo      ?? "",
          documento_tipo:      clienteData.documento_tipo      ?? "CI",
          documento_numero:    clienteData.documento_numero    ?? "",
          email:               clienteData.email               ?? "",
          email_secundario:    clienteData.email_secundario    ?? "",
          telefono:            clienteData.telefono            ?? "",
          telefono_secundario: clienteData.telefono_secundario ?? "",
          instagram:           clienteData.instagram           ?? "",
          facebook:            clienteData.facebook            ?? "",
          tiktok:              clienteData.tiktok              ?? "",
          fecha_nacimiento:    clienteData.fecha_nacimiento    ?? "",
          nacionalidad:        clienteData.nacionalidad        ?? "Boliviana",
          ciudad:              clienteData.ciudad              ?? "",
          pais:                clienteData.pais                ?? "Bolivia",
          estado:              clienteData.estado              ?? "activo",
          profesion:           clienteData.profesion           ?? "",
          estado_civil:        clienteData.estado_civil        ?? "",
          asesor_nombre:       clienteData.asesor_nombre       ?? "",
          club_viajes:         clienteData.club_viajes         ?? false,
          espacio_a_bordo:     clienteData.espacio_a_bordo     ?? false,
          pases_a_bordo:       String(clienteData.pases_a_bordo ?? "0"),
          dias_credito:        String(clienteData.dias_credito  ?? ""),
          notas_rapidas:       clienteData.notas_rapidas       ?? "",
        });
      } else {
        setForm({
          ...EMPTY_FORM,
          nombre_completo: initialNombre,
          telefono:        initialTelefono,
          canal_contacto:  initialCanal,
        });
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [saving, setSaving]       = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ── Voice recording ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setProcessing(true);
        try {
          const fields = await transcribeAndFill(blob, form.tipo_cliente);
          setForm(prev => ({ ...prev, ...fields }));
          setTranscript("Campos completados con IA");
          toast.success("Campos completados automáticamente");
        } catch (err: any) {
          toast.error(err.message ?? "Error al procesar audio");
        } finally {
          setProcessing(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!form.nombre_completo.trim() && !form.razon_social.trim()) {
      toast.error("Ingresá al menos el nombre o razón social");
      return;
    }
    if (!isEditMode && !form.canal_contacto) {
      toast.error("Seleccioná el canal de contacto");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        tipo_cliente:        form.tipo_cliente,
        canal_contacto:      form.canal_contacto,
        nombre_completo:     form.nombre_completo || form.razon_social,
        razon_social:        form.razon_social     || null,
        nit:                 form.nit              || null,
        contacto_nombre:     form.contacto_nombre  || null,
        contacto_cargo:      form.contacto_cargo   || null,
        documento_tipo:      form.documento_tipo   || "CI",
        documento_numero:    form.documento_numero || null,
        email:               form.email            || null,
        email_secundario:    form.email_secundario || null,
        telefono:            form.telefono         || null,
        telefono_secundario: form.telefono_secundario || null,
        instagram:           form.instagram  || null,
        facebook:            form.facebook   || null,
        tiktok:              form.tiktok     || null,
        fecha_nacimiento:    form.fecha_nacimiento || null,
        nacionalidad:        form.nacionalidad     || null,
        ciudad:              form.ciudad           || null,
        pais:                form.pais             || null,
        estado:              form.estado,
        profesion:           form.profesion        || null,
        estado_civil:        form.estado_civil     || null,
        asesor_nombre:       form.asesor_nombre    || null,
        club_viajes:         form.club_viajes,
        espacio_a_bordo:     form.espacio_a_bordo,
        pases_a_bordo:       parseInt(form.pases_a_bordo) || 0,
        dias_credito:        form.dias_credito ? parseInt(form.dias_credito) : null,
        notas_rapidas:       form.notas_rapidas    || null,
        score_valor:         0,
      };

      let error: any;
      let inserted: any = null;
      if (isEditMode) {
        ({ error } = await (supabase as any).from("clientes").update(payload).eq("id", clienteId));
      } else {
        ({ data: inserted, error } = await (supabase as any)
          .from("clientes")
          .insert(payload)
          .select("id, nombre_completo, telefono, email")
          .single());
      }
      if (error) throw error;

      toast.success(isEditMode ? "Cliente actualizado correctamente" : "Cliente creado correctamente");
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      if (inserted && onCreated) {
        onCreated(inserted.id, inserted.nombre_completo, inserted.telefono, inserted.email);
      }
      setForm({ ...EMPTY_FORM });
      setTranscript(null);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm({ ...EMPTY_FORM });
    setTranscript(null);
    onOpenChange(false);
  };

  const hasApiKey = !!import.meta.env.VITE_OPENAI_API_KEY;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-full sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {form.tipo_cliente === "juridica"
              ? <Building2 className="w-4 h-4 text-violet-600" />
              : <User className="w-4 h-4 text-primary" />
            }
            {isEditMode ? "Editar cliente" : "Nuevo cliente"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">

          {/* ── Tipo de cliente ── */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Tipo de cliente</Label>
            <div className="flex gap-2">
              {(["natural", "juridica"] as TipoCliente[]).map(tipo => (
                <button
                  key={tipo}
                  onClick={() => set("tipo_cliente", tipo)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.tipo_cliente === tipo
                      ? tipo === "juridica"
                        ? "bg-violet-500/10 border-violet-300 text-violet-700"
                        : "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {tipo === "juridica" ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  {tipo === "juridica" ? "Persona jurídica" : "Persona natural"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Canal de contacto (obligatorio) ── */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              Canal de contacto <span className="text-destructive">*</span>
            </Label>
            <select
              className={`w-full h-9 text-sm rounded-md border px-3 bg-background ${
                !form.canal_contacto ? 'border-destructive/50 bg-destructive/5' : 'border-input'
              }`}
              value={form.canal_contacto}
              onChange={e => set("canal_contacto", e.target.value)}
            >
              <option value="">— Seleccioná el canal —</option>
              {CANALES_CONTACTO.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {!form.canal_contacto && (
              <p className="text-[10px] text-destructive mt-1">Campo obligatorio</p>
            )}
          </div>

          {/* ── AI Voice button ── */}
          <div className={`flex items-center gap-3 rounded-xl border p-3 ${hasApiKey ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Completar con voz (IA)
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {hasApiKey
                  ? recording
                    ? "Grabando… hablá los datos del cliente. Soltá cuando termines."
                    : processing
                      ? "Procesando audio con OpenAI…"
                      : transcript ?? "Presioná el botón, hablá los datos del cliente y soltá."
                  : "Configurá VITE_OPENAI_API_KEY para habilitar esta función"
                }
              </p>
            </div>
            <button
              disabled={!hasApiKey || processing}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                !hasApiKey
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : recording
                    ? "bg-red-500 text-white shadow-lg scale-110 animate-pulse"
                    : processing
                      ? "bg-primary/20 text-primary"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          <Separator />

          {/* ── Campos persona jurídica ── */}
          {form.tipo_cliente === "juridica" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datos de la empresa</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Razón social *">
                  <Input className="h-8 text-xs" value={form.razon_social} onChange={e => set("razon_social", e.target.value)} placeholder="Empresa S.R.L." />
                </Field>
                <Field label="Nombre corto">
                  <Input className="h-8 text-xs" value={form.nombre_completo} onChange={e => set("nombre_completo", e.target.value)} placeholder="Empresa" />
                </Field>
                <Field label="NIT">
                  <Input className="h-8 text-xs" value={form.nit} onChange={e => set("nit", e.target.value)} placeholder="1023456789" />
                </Field>
                <Field label="Persona de contacto">
                  <Input className="h-8 text-xs" value={form.contacto_nombre} onChange={e => set("contacto_nombre", e.target.value)} placeholder="Nombre del contacto" />
                </Field>
                <Field label="Cargo del contacto">
                  <Input className="h-8 text-xs" value={form.contacto_cargo} onChange={e => set("contacto_cargo", e.target.value)} placeholder="Gerente Comercial" />
                </Field>
                <Field label="Días de crédito">
                  <Input className="h-8 text-xs" type="number" min="0" value={form.dias_credito} onChange={e => set("dias_credito", e.target.value)} placeholder="Ej: 30" />
                </Field>
              </div>
            </div>
          )}

          {/* ── Campos persona natural ── */}
          {form.tipo_cliente === "natural" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datos personales</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nombre completo *">
                  <Input className="h-8 text-xs" value={form.nombre_completo} onChange={e => set("nombre_completo", e.target.value)} placeholder="Juan Pérez" />
                </Field>
                <Field label="Tipo de documento">
                  <select
                    className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    value={form.documento_tipo}
                    onChange={e => set("documento_tipo", e.target.value)}
                  >
                    <option value="CI">Carnet de identidad</option>
                    <option value="Pasaporte">Pasaporte</option>
                    <option value="RUC">RUC</option>
                  </select>
                </Field>
                <Field label="Número de documento">
                  <Input className="h-8 text-xs" value={form.documento_numero} onChange={e => set("documento_numero", e.target.value)} placeholder="7654321" />
                </Field>
                <Field label="Fecha de nacimiento">
                  <Input className="h-8 text-xs" type="date" value={form.fecha_nacimiento} onChange={e => set("fecha_nacimiento", e.target.value)} />
                </Field>
                <Field label="Nacionalidad">
                  <Input className="h-8 text-xs" value={form.nacionalidad} onChange={e => set("nacionalidad", e.target.value)} placeholder="Boliviana" />
                </Field>
                <Field label="Profesión">
                  <Input className="h-8 text-xs" value={form.profesion} onChange={e => set("profesion", e.target.value)} placeholder="Empresario" />
                </Field>
                <Field label="Estado civil">
                  <select
                    className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    value={form.estado_civil}
                    onChange={e => set("estado_civil", e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    <option value="soltero">Soltero/a</option>
                    <option value="casado">Casado/a</option>
                    <option value="divorciado">Divorciado/a</option>
                    <option value="viudo">Viudo/a</option>
                  </select>
                </Field>
                <Field label="Canal de contacto">
                  <select
                    className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    value={form.canal_contacto}
                    onChange={e => set("canal_contacto", e.target.value)}
                  >
                    <option value="">— Seleccioná el canal —</option>
                    {CANALES_CONTACTO.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}

          <Separator />

          {/* ── Contacto (ambos tipos) ── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contacto y ubicación</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Teléfono principal">
                <Input className="h-8 text-xs" value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="+591 70012345" />
              </Field>
              <Field label="Teléfono secundario">
                <Input className="h-8 text-xs" value={form.telefono_secundario} onChange={e => set("telefono_secundario", e.target.value)} placeholder="+591 33445566" />
              </Field>
              <Field label="Email principal">
                <Input className="h-8 text-xs" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@ejemplo.com" />
              </Field>
              <Field label="Email secundario">
                <Input className="h-8 text-xs" type="email" value={form.email_secundario} onChange={e => set("email_secundario", e.target.value)} placeholder="otro@ejemplo.com" />
              </Field>
              <Field label="Ciudad">
                <Input className="h-8 text-xs" value={form.ciudad} onChange={e => set("ciudad", e.target.value)} placeholder="Santa Cruz" />
              </Field>
              <Field label="País">
                <Input className="h-8 text-xs" value={form.pais} onChange={e => set("pais", e.target.value)} placeholder="Bolivia" />
              </Field>
            </div>

            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-1">Redes sociales</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Instagram">
                <Input className="h-8 text-xs" value={form.instagram} onChange={e => set("instagram", e.target.value)} placeholder="@usuario" />
              </Field>
              <Field label="Facebook">
                <Input className="h-8 text-xs" value={form.facebook} onChange={e => set("facebook", e.target.value)} placeholder="@usuario o URL" />
              </Field>
              <Field label="TikTok">
                <Input className="h-8 text-xs" value={form.tiktok} onChange={e => set("tiktok", e.target.value)} placeholder="@usuario" />
              </Field>
            </div>
          </div>

          <Separator />

          {/* ── CRM ── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CRM</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Estado">
                <select
                  className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                  value={form.estado}
                  onChange={e => set("estado", e.target.value)}
                >
                  <option value="activo">Activo</option>
                  <option value="vip">VIP</option>
                  <option value="potencial">Potencial</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </Field>
              <Field label="Asesor asignado">
                <select
                  className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                  value={form.asesor_nombre}
                  onChange={e => set("asesor_nombre", e.target.value)}
                >
                  <option value="">— Sin asesor —</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-3">
              {[
                { field: "club_viajes"    as keyof FormData, label: "Club de viajes" },
                { field: "espacio_a_bordo" as keyof FormData, label: "Espacio a bordo" },
              ].map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form[field]}
                    onChange={e => set(field, e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
              <Field label="Pases a bordo">
                <Input className="h-8 text-xs w-20" type="number" min="0" value={form.pases_a_bordo} onChange={e => set("pases_a_bordo", e.target.value)} />
              </Field>
            </div>

            <Field label="Notas rápidas">
              <textarea
                className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 min-h-[60px] resize-none"
                value={form.notas_rapidas}
                onChange={e => set("notas_rapidas", e.target.value)}
                placeholder="Preferencias, observaciones importantes…"
              />
            </Field>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            {isEditMode ? "Guardar cambios" : "Guardar cliente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

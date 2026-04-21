import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Minimize2 } from 'lucide-react';

type CallState = 'idle' | 'ringing_in' | 'ringing_out' | 'active' | 'wrapup';

export function SoftphoneWidget() {
  const [state, setState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  // Inicia minimizado para no competir con la conversación activa
  const [minimized, setMinimized] = useState(true);
  const [dialNumber, setDialNumber] = useState('');
  const [wrapUpNote, setWrapUpNote] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Si llega una llamada activa o entrante, expandir automáticamente
  useEffect(() => {
    if (state === 'active' || state === 'ringing_in') {
      setMinimized(false);
    }
  }, [state]);

  useEffect(() => {
    if (state === 'active') {
      intervalRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (state === 'idle') setDuration(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const simulateIncoming = () => setState('ringing_in');
  const makeCall = () => { if (dialNumber) { setState('ringing_out'); setTimeout(() => setState('active'), 2000); } };
  const answer = () => setState('active');
  const hangup = () => setState('wrapup');
  const finishWrapup = () => { setState('idle'); setWrapUpNote(''); setDialNumber(''); };

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className={`fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          state === 'active' ? 'bg-success animate-pulse' : state === 'ringing_in' ? 'bg-success animate-pulse' : 'bg-primary'
        }`}
      >
        <Phone className="w-5 h-5 text-primary-foreground" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-sidebar-accent-foreground" />
          <span className="text-[11px] font-medium text-sidebar-accent-foreground">Softphone</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar-foreground/60">Simulado</span>
        </div>
        <button onClick={() => setMinimized(true)} className="text-sidebar-foreground/60 hover:text-sidebar-accent-foreground">
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3">
        {state === 'idle' && (
          <div className="space-y-2">
            <input
              type="text"
              value={dialNumber}
              onChange={e => setDialNumber(e.target.value)}
              placeholder="+52 55 1234 5678"
              className="w-full bg-muted/50 text-sm rounded-md px-3 py-2 border border-border text-center font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                onClick={makeCall}
                disabled={!dialNumber}
                className="flex-1 py-2 rounded-md bg-success text-success-foreground text-xs font-medium hover:bg-success/90 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Phone className="w-3.5 h-3.5" /> Llamar
              </button>
              <button
                onClick={simulateIncoming}
                className="py-2 px-3 rounded-md bg-muted text-muted-foreground text-xs hover:bg-accent/50 flex items-center gap-1.5"
                title="Simular llamada entrante"
              >
                <PhoneIncoming className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {state === 'ringing_in' && (
          <div className="text-center space-y-3">
            <div className="animate-pulse">
              <PhoneIncoming className="w-8 h-8 text-success mx-auto" />
            </div>
            <div>
              <p className="text-sm font-medium">Llamada entrante</p>
              <p className="text-xs text-muted-foreground">+52 55 9999 1234</p>
            </div>
            <div className="flex gap-2 justify-center">
              <button onClick={answer} className="px-6 py-2 rounded-md bg-success text-success-foreground text-xs font-medium">
                Contestar
              </button>
              <button onClick={() => setState('idle')} className="px-6 py-2 rounded-md bg-destructive text-destructive-foreground text-xs font-medium">
                Rechazar
              </button>
            </div>
          </div>
        )}

        {state === 'ringing_out' && (
          <div className="text-center space-y-3">
            <Phone className="w-8 h-8 text-primary mx-auto animate-pulse" />
            <div>
              <p className="text-sm font-medium">Llamando...</p>
              <p className="text-xs text-muted-foreground font-mono">{dialNumber}</p>
            </div>
            <button onClick={() => setState('idle')} className="px-6 py-2 rounded-md bg-destructive text-destructive-foreground text-xs font-medium">
              Cancelar
            </button>
          </div>
        )}

        {state === 'active' && (
          <div className="text-center space-y-3">
            <div>
              <p className="text-sm font-medium text-success">En llamada</p>
              <p className="text-2xl font-mono font-bold text-foreground">{formatTime(duration)}</p>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setMuted(!muted)}
                className={`p-2.5 rounded-full ${muted ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:bg-accent/50'}`}
              >
                {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button onClick={hangup} className="p-2.5 rounded-full bg-destructive text-destructive-foreground">
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {state === 'wrapup' && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-center">Wrap-up</p>
            <p className="text-[10px] text-muted-foreground text-center">Duración: {formatTime(duration)}</p>
            <textarea
              value={wrapUpNote}
              onChange={e => setWrapUpNote(e.target.value)}
              placeholder="Notas de la llamada..."
              rows={3}
              className="w-full bg-muted/50 text-xs rounded-md px-3 py-2 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <button onClick={finishWrapup} className="w-full py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
              Guardar y cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

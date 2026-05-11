# ═══════════════════════════════════════════════════════════════════════════════
# test_motor_local.ps1 — Test end-to-end del motor LAT en local
#
# Uso:
#   1. Tener Supabase local corriendo:  supabase start
#   2. En otra terminal, levantar funciones:
#      supabase functions serve --env-file supabase/.env.local --no-verify-jwt
#   3. Ejecutar este script:  .\test_motor_local.ps1
#
# Simula un mensaje de WhatsApp entrante via Gupshup y verifica todo el flujo:
#   wpp-webhook → lat-routing-engine → lat-bot-agent → lat-assign-engine
# ═══════════════════════════════════════════════════════════════════════════════

$BASE_URL     = "http://127.0.0.1:54321"
$FUNC_URL     = "$BASE_URL/functions/v1"
$DB_URL       = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
$PSQL         = "$env:USERPROFILE\scoop\apps\postgresql\current\bin\psql.exe"
$SERVICE_JWT  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0"

# Número de teléfono del "cliente" de prueba (distinto al canal propio)
$TEST_PHONE   = "59171234567"
$TEST_NOMBRE  = "Carlos Prueba"

# ─── Colores ──────────────────────────────────────────────────────────────────

function Write-OK   { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-FAIL { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-INFO { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Write-STEP { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Yellow }

# ─── 1. Verificar que Supabase local está corriendo ───────────────────────────

Write-STEP "1. Verificando Supabase local"
try {
    $health = Invoke-RestMethod "$BASE_URL/rest/v1/" -TimeoutSec 3 -ErrorAction Stop
    Write-OK "Supabase REST responde"
} catch {
    Write-FAIL "Supabase local no responde en $BASE_URL. Corré: supabase start"
    exit 1
}

# ─── 2. Verificar que functions serve está corriendo ──────────────────────────

Write-STEP "2. Verificando supabase functions serve"
try {
    $hdr = @{ Authorization = "Bearer $SERVICE_JWT" }
    $probe = Invoke-WebRequest "$FUNC_URL/wpp-webhook" -Method GET -Headers $hdr -TimeoutSec 3 -ErrorAction Stop
    Write-OK "wpp-webhook responde (status $($probe.StatusCode))"
} catch {
    if ($_.Exception.Response.StatusCode -in @(400,403,405)) {
        Write-OK "wpp-webhook responde (esperado $($_.Exception.Response.StatusCode))"
    } else {
        Write-FAIL "functions serve no está corriendo. En otra terminal:"
        Write-INFO "  supabase functions serve --env-file supabase/.env.local --no-verify-jwt"
        exit 1
    }
}

# ─── 3. Verificar datos de seed ───────────────────────────────────────────────

Write-STEP "3. Verificando seed local"

$seedCheck = & $PSQL $DB_URL -t -A -c @"
SELECT
  (SELECT count(*)::text FROM lat_colas WHERE activa = true)        AS colas,
  (SELECT count(*)::text FROM lat_bot_config WHERE activo = true)   AS bot_config,
  (SELECT count(*)::text FROM lat_reglas_asignacion WHERE activa = true) AS reglas,
  (SELECT count(*)::text FROM colaborador_presencia WHERE conectado = true) AS agentes;
"@ 2>&1

Write-INFO "DB check: $seedCheck"

$botConfigCount = & $PSQL $DB_URL -t -A -c "SELECT count(*) FROM lat_bot_config WHERE activo = true AND canal = 'whatsapp';" 2>&1
if ($botConfigCount.Trim() -eq "0") {
    Write-FAIL "lat_bot_config vacío — aplicá el seed: psql `"$DB_URL`" -f supabase/seed_local_test.sql"
    exit 1
}
Write-OK "Bot config WhatsApp activo"

# ─── 4. Limpiar conversaciones de prueba anteriores ───────────────────────────

Write-STEP "4. Limpiando datos de prueba anteriores"
& $PSQL $DB_URL -c @"
DELETE FROM lat_mensajes
  WHERE conversacion_id IN (
    SELECT id FROM lat_conversaciones WHERE telefono = '$TEST_PHONE'
  );
DELETE FROM lat_conversaciones WHERE telefono = '$TEST_PHONE';
"@ 2>&1 | Out-Null
Write-OK "Limpieza ok"

# ─── 5. Enviar mensaje de prueba al webhook ────────────────────────────────────

Write-STEP "5. Enviando mensaje de prueba (simula Gupshup WA)"

$payload = @{
    app  = "TropicalBot"
    type = "message"
    payload = @{
        source  = $TEST_PHONE
        type    = "text"
        payload = @{ text = "Hola! Quisiera información sobre paquetes vacacionales a Brasil" }
        sender  = @{ name = $TEST_NOMBRE }
    }
} | ConvertTo-Json -Depth 5

$headers = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $SERVICE_JWT"
}

try {
    $resp = Invoke-RestMethod "$FUNC_URL/wpp-webhook" -Method POST -Headers $headers -Body $payload -TimeoutSec 15
    Write-OK "wpp-webhook respondió: $($resp | ConvertTo-Json -Compress)"
} catch {
    Write-FAIL "wpp-webhook error: $($_.Exception.Message)"
    Write-INFO "Response: $($_.ErrorDetails.Message)"
    exit 1
}

# ─── 6. Esperar que el bot procese (async) ────────────────────────────────────

Write-STEP "6. Esperando que el bot procese (5s)..."
Start-Sleep -Seconds 5

# ─── 7. Verificar resultados en DB ────────────────────────────────────────────

Write-STEP "7. Verificando resultados en DB"

# 7a. Conversación creada
$conv = & $PSQL $DB_URL -t -A -c @"
SELECT id || '|' || estado || '|' || COALESCE(bot_estado,'?') || '|' || COALESCE(cola_id::text,'sin-cola')
FROM lat_conversaciones WHERE telefono = '$TEST_PHONE' LIMIT 1;
"@ 2>&1

if ($conv -match "\|") {
    $parts = $conv.Split("|")
    $convId    = $parts[0].Trim()
    $estado    = $parts[1].Trim()
    $botEstado = $parts[2].Trim()
    $colaId    = $parts[3].Trim()
    Write-OK "Conversación: id=$convId | estado=$estado | bot=$botEstado | cola=$colaId"
} else {
    Write-FAIL "No se creó la conversación en lat_conversaciones"
    exit 1
}

# 7b. Mensajes creados
$msgs = & $PSQL $DB_URL -t -A -c @"
SELECT tipo || ' | ' || substring(contenido,1,60) || '...'
FROM lat_mensajes WHERE conversacion_id = '$convId' ORDER BY created_at;
"@ 2>&1

Write-INFO "Mensajes:"
$msgs | ForEach-Object { Write-INFO "  $_" }

$inboundCount  = ($msgs | Where-Object { $_ -match "^inbound" }).Count
$outboundCount = ($msgs | Where-Object { $_ -match "^outbound" }).Count

if ($inboundCount -gt 0)  { Write-OK "Mensaje inbound registrado ($inboundCount)" } else { Write-FAIL "Sin mensaje inbound" }
if ($outboundCount -gt 0) { Write-OK "Bot respondió ($outboundCount mensaje/s outbound)" } else { Write-FAIL "Bot no respondió — verificá OPENAI_API_KEY en supabase/.env.local" }

# 7c. Trazabilidad
$traz = & $PSQL $DB_URL -t -A -c @"
SELECT evento || ' | ' || COALESCE(detalle,'')
FROM lat_trazabilidad WHERE conversacion_id = '$convId' ORDER BY created_at;
"@ 2>&1

if ($traz) {
    Write-OK "Trazabilidad:"
    $traz | ForEach-Object { Write-INFO "  $_" }
} else {
    Write-INFO "Sin trazabilidad (normal si el routing no completó asignación)"
}

# 7d. Routing status final
$routing = & $PSQL $DB_URL -t -A -c @"
SELECT
  estado,
  estado_asignacion,
  bot_estado,
  bot_turnos,
  COALESCE(intencion_detectada,'sin-intencion') as intencion,
  COALESCE((SELECT nombre FROM lat_colas WHERE id = c.cola_id),'sin-cola') as cola_nombre,
  COALESCE((SELECT nombre FROM colaboradores WHERE id = c.responsable_id),'sin-asesor') as asesor
FROM lat_conversaciones c WHERE id = '$convId';
"@ 2>&1

Write-STEP "8. Resumen final"
Write-INFO $routing

# ─── Evaluación final ─────────────────────────────────────────────────────────

Write-Host ""
if ($outboundCount -gt 0 -and ($routing -match "activo|handed_off|asignada")) {
    Write-Host "MOTOR FUNCIONANDO CORRECTAMENTE" -ForegroundColor Green
} elseif ($inboundCount -gt 0) {
    Write-Host "FLUJO PARCIAL — Mensaje recibido pero bot no completó. Ver logs de functions serve." -ForegroundColor Yellow
} else {
    Write-Host "FALLO — Revisar logs de wpp-webhook en la terminal de functions serve." -ForegroundColor Red
}

Write-Host ""
Write-INFO "Ver logs en tiempo real: supabase functions serve --env-file supabase/.env.local --no-verify-jwt"
Write-INFO "Studio DB local:         http://127.0.0.1:54323"

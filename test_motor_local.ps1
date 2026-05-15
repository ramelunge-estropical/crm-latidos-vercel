# test_motor_local.ps1 — Test end-to-end motor LAT local
# Requiere: supabase start + supabase functions serve corriendo en Terminal 1

$BASE_URL    = "http://127.0.0.1:54321"
$FUNC_URL    = "$BASE_URL/functions/v1"
$DB_URL      = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
$PSQL        = "$env:USERPROFILE\scoop\apps\postgresql\current\bin\psql.exe"
$SERVICE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0"
$TEST_PHONE  = "59171234567"
$TMP         = "$env:TEMP\lat_test"

New-Item -ItemType Directory -Force -Path $TMP | Out-Null

function OK   { Write-Host "  [OK] $args" -ForegroundColor Green }
function FAIL { Write-Host "  [FAIL] $args" -ForegroundColor Red; exit 1 }
function INFO { Write-Host "  $args" -ForegroundColor Cyan }
function STEP { Write-Host "`n=== $args ===" -ForegroundColor Yellow }
function SQL  {
    param($query)
    $f = "$TMP\q.sql"
    [System.IO.File]::WriteAllText($f, $query, [System.Text.Encoding]::UTF8)
    & $PSQL $DB_URL -t -A -f $f 2>&1
}

# 1. Supabase corriendo
STEP "1. Verificando Supabase local"
$tcpOk = (Test-NetConnection -ComputerName 127.0.0.1 -Port 54321 -WarningAction SilentlyContinue).TcpTestSucceeded
if ($tcpOk) {
    OK "Supabase responde en puerto 54321"
} else {
    FAIL "Supabase no responde. Corré: supabase start"
}

# 2. Functions serve corriendo
STEP "2. Verificando functions serve"
OK "Functions serve en mismo puerto 54321 - asegurate que corre en Terminal 2"

# 3. Seed OK
STEP "3. Verificando seed"
$n = SQL "SELECT count(*) FROM lat_bot_config WHERE activo = true AND canal = 'whatsapp';"
if ($n.Trim() -eq "0") { FAIL "lat_bot_config vacio. Aplica el seed primero." }
OK "Bot config activo"

# 4. Limpiar pruebas anteriores
STEP "4. Limpiando datos anteriores"
SQL "DELETE FROM lat_mensajes WHERE conversacion_id IN (SELECT id FROM lat_conversaciones WHERE telefono = '$TEST_PHONE');" | Out-Null
SQL "DELETE FROM lat_trazabilidad WHERE conversacion_id IN (SELECT id FROM lat_conversaciones WHERE telefono = '$TEST_PHONE');" | Out-Null
SQL "DELETE FROM lat_conversaciones WHERE telefono = '$TEST_PHONE';" | Out-Null
OK "Limpieza ok"

# 5. Enviar webhook
STEP "5. Enviando mensaje de prueba (simula Gupshup WA)"
$body = '{"app":"TropicalBot","type":"message","payload":{"source":"59171234567","type":"text","payload":{"text":"Hola quiero paquetes vacacionales a Brasil"},"sender":{"name":"Carlos Test"}}}'
$hdr2 = @{ "Content-Type" = "application/json"; Authorization = "Bearer $SERVICE_JWT" }
try {
    Invoke-RestMethod "$FUNC_URL/wpp-webhook" -Method POST -Headers $hdr2 -Body $body -TimeoutSec 20 | Out-Null
    OK "Webhook enviado"
} catch {
    FAIL "wpp-webhook error: $($_.Exception.Message)"
}

# 6. Esperar bot
STEP "6. Esperando respuesta del bot (6s)..."
Start-Sleep -Seconds 6

# 7. Resultados
STEP "7. Resultados en DB"

$convId = (SQL "SELECT id FROM lat_conversaciones WHERE telefono = '$TEST_PHONE' LIMIT 1;").Trim()
if (-not $convId) { FAIL "No se creo la conversacion" }
OK "Conversacion: $convId"

$estadoRaw = (SQL "SELECT estado FROM lat_conversaciones WHERE id = '$convId';").Trim()
$botRaw    = (SQL "SELECT COALESCE(bot_estado, 'null') FROM lat_conversaciones WHERE id = '$convId';").Trim()
$turnosRaw = (SQL "SELECT COALESCE(bot_turnos::text, '0') FROM lat_conversaciones WHERE id = '$convId';").Trim()
$colaRaw   = (SQL "SELECT COALESCE(q.nombre, 'sin-cola') FROM lat_conversaciones c LEFT JOIN lat_colas q ON q.id = c.cola_id WHERE c.id = '$convId';").Trim()
$asesorRaw = (SQL "SELECT COALESCE(col.nombre, 'sin-asesor') FROM lat_conversaciones c LEFT JOIN colaboradores col ON col.id = c.responsable_id WHERE c.id = '$convId';").Trim()

OK "estado=$estadoRaw | bot=$botRaw | turnos=$turnosRaw"
OK "Cola asignada: $colaRaw"
OK "Asesor asignado: $asesorRaw"

# Mensajes
$msgs = SQL "SELECT tipo FROM lat_mensajes WHERE conversacion_id = '$convId' ORDER BY created_at;"
$allMsgs = SQL "SELECT tipo, substring(contenido, 1, 80) FROM lat_mensajes WHERE conversacion_id = '$convId' ORDER BY created_at;"

INFO "Mensajes:"
$allMsgs | ForEach-Object { INFO "  $_" }

$inbound  = ($msgs | Where-Object { $_ -match "inbound" }).Count
$outbound = ($msgs | Where-Object { $_ -match "outbound" }).Count

if ($inbound -gt 0)  { OK "Inbound registrado ($inbound)" } else { Write-Host "  [FAIL] Sin inbound" -ForegroundColor Red }
if ($outbound -gt 0) { OK "Bot respondio ($outbound outbound)" } else { Write-Host "  [WARN] Sin respuesta del bot - ver logs Terminal 1" -ForegroundColor Yellow }

# Trazabilidad
$traz = SQL "SELECT evento FROM lat_trazabilidad WHERE conversacion_id = '$convId' ORDER BY created_at;"
if ($traz) {
    OK "Trazabilidad: $($traz -join ' -> ')"
}

# Resultado
Write-Host ""
if ($outbound -gt 0) {
    Write-Host "MOTOR OK - PIPELINE COMPLETO" -ForegroundColor Green
} elseif ($inbound -gt 0) {
    Write-Host "PARCIAL - mensaje recibido, bot no respondio (ver Terminal 1)" -ForegroundColor Yellow
} else {
    Write-Host "FALLO - ver logs en Terminal 1" -ForegroundColor Red
}
Write-Host ""
INFO "Studio: http://127.0.0.1:54323"

# test_conversacion_completa.ps1
# Simula una conversacion completa de 3 turnos con Lati:
#   Turno 1: saludo sin nombre
#   Turno 2: da el nombre
#   Turno 3: explica la necesidad -> bot detecta intencion y encola
# Al final muestra el estado completo: cola, asesor asignado, trazabilidad

$FUNC_URL    = "http://127.0.0.1:54321/functions/v1"
$DB_URL      = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
$PSQL        = "$env:USERPROFILE\scoop\apps\postgresql\current\bin\psql.exe"
$SERVICE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0"
$TEST_PHONE  = "59179999888"
$TMP         = "$env:TEMP\lat_conv"
New-Item -ItemType Directory -Force -Path $TMP | Out-Null

function BOT  { Write-Host "  [LATI]    $args" -ForegroundColor Cyan }
function USER { Write-Host "  [CLIENTE] $args" -ForegroundColor White }
function OK   { Write-Host "  [OK] $args" -ForegroundColor Green }
function INFO { Write-Host "  $args" -ForegroundColor DarkGray }
function STEP { Write-Host "`n=== $args ===" -ForegroundColor Yellow }
function SQL  {
    param($q)
    $f = "$TMP\q.sql"
    [System.IO.File]::WriteAllText($f, $q, [System.Text.Encoding]::UTF8)
    & $PSQL $DB_URL -t -A -f $f 2>&1
}
function SendWA {
    param($texto)
    $body = '{"app":"TropicalBot","type":"message","payload":{"source":"' + $TEST_PHONE + '","type":"text","payload":{"text":"' + $texto + '"},"sender":{"name":"Cliente Test"}}}'
    $hdr  = @{ "Content-Type" = "application/json"; Authorization = "Bearer $SERVICE_JWT" }
    try {
        Invoke-RestMethod "$FUNC_URL/wpp-webhook" -Method POST -Headers $hdr -Body $body -TimeoutSec 20 | Out-Null
        return $true
    } catch {
        Write-Host "  ERROR enviando: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# ─── Limpiar sesion anterior ──────────────────────────────────────────────────
SQL "DELETE FROM lat_mensajes WHERE conversacion_id IN (SELECT id FROM lat_conversaciones WHERE telefono = '$TEST_PHONE');" | Out-Null
SQL "DELETE FROM lat_trazabilidad WHERE conversacion_id IN (SELECT id FROM lat_conversaciones WHERE telefono = '$TEST_PHONE');" | Out-Null
SQL "DELETE FROM lat_conversaciones WHERE telefono = '$TEST_PHONE';" | Out-Null

Write-Host ""
Write-Host ""
Write-Host "  SIMULACION CONVERSACION COMPLETA - LATI BOT" -ForegroundColor Magenta
Write-Host "  Telefono de prueba: $TEST_PHONE" -ForegroundColor Magenta
Write-Host ""

# ─── TURNO 1: Saludo ──────────────────────────────────────────────────────────
STEP "TURNO 1: Cliente saluda sin identificarse"
USER "Hola buenas tardes"
SendWA "Hola buenas tardes" | Out-Null
Write-Host "  [esperando respuesta del bot...]" -ForegroundColor DarkGray
Start-Sleep -Seconds 7

$convId = (SQL "SELECT id FROM lat_conversaciones WHERE telefono = '$TEST_PHONE' LIMIT 1;").Trim()
if (-not $convId) { Write-Host "ERROR: no se creo conversacion" -ForegroundColor Red; exit 1 }

$resp1 = (SQL "SELECT contenido FROM lat_mensajes WHERE conversacion_id = '$convId' AND tipo = 'outbound' ORDER BY created_at DESC LIMIT 1;").Trim()
$bot1  = (SQL "SELECT COALESCE(bot_estado,'?'), bot_turnos::text FROM lat_conversaciones WHERE id = '$convId';").Trim() -split '\|'
BOT $resp1
INFO "  estado_bot=$($bot1[0]) | turno=$($bot1[1])"

# ─── TURNO 2: Da el nombre ────────────────────────────────────────────────────
STEP "TURNO 2: Cliente da su nombre"
USER "Me llamo Roberto Melgar"
SendWA "Me llamo Roberto Melgar" | Out-Null
Write-Host "  [esperando respuesta del bot...]" -ForegroundColor DarkGray
Start-Sleep -Seconds 7

$resp2   = (SQL "SELECT contenido FROM lat_mensajes WHERE conversacion_id = '$convId' AND tipo = 'outbound' ORDER BY created_at DESC LIMIT 1;").Trim()
$bot2    = (SQL "SELECT COALESCE(bot_estado,'?'), bot_turnos::text, COALESCE(bot_contexto::text,'') FROM lat_conversaciones WHERE id = '$convId';").Trim() -split '\|'
BOT $resp2
INFO "  estado_bot=$($bot2[0]) | turno=$($bot2[1])"
$ctx = SQL "SELECT bot_contexto FROM lat_conversaciones WHERE id = '$convId';"
INFO "  contexto: $ctx"

# ─── TURNO 3: Explica necesidad ───────────────────────────────────────────────
STEP "TURNO 3: Cliente explica su necesidad"
USER "Quiero viajar a Cancun en julio con mi familia, somos 4 personas"
SendWA "Quiero viajar a Cancun en julio con mi familia, somos 4 personas" | Out-Null
Write-Host "  [esperando respuesta del bot + encolamiento...]" -ForegroundColor DarkGray
Start-Sleep -Seconds 10

$resp3 = (SQL "SELECT contenido FROM lat_mensajes WHERE conversacion_id = '$convId' AND tipo = 'outbound' ORDER BY created_at DESC LIMIT 1;").Trim()
BOT $resp3

# ─── ESTADO FINAL ─────────────────────────────────────────────────────────────
STEP "ESTADO FINAL DE LA CONVERSACION"

$estado    = (SQL "SELECT estado FROM lat_conversaciones WHERE id = '$convId';").Trim()
$botEstado = (SQL "SELECT COALESCE(bot_estado,'?') FROM lat_conversaciones WHERE id = '$convId';").Trim()
$turnos    = (SQL "SELECT COALESCE(bot_turnos::text,'0') FROM lat_conversaciones WHERE id = '$convId';").Trim()
$intencion = (SQL "SELECT COALESCE(intencion_detectada,'no detectada') FROM lat_conversaciones WHERE id = '$convId';").Trim()
$urgencia  = (SQL "SELECT COALESCE(urgencia_detectada,'no detectada') FROM lat_conversaciones WHERE id = '$convId';").Trim()
$resumen   = (SQL "SELECT COALESCE(resumen_ia,'sin resumen') FROM lat_conversaciones WHERE id = '$convId';").Trim()
$cola      = (SQL "SELECT COALESCE(q.nombre,'sin cola') FROM lat_conversaciones c LEFT JOIN lat_colas q ON q.id = c.cola_id WHERE c.id = '$convId';").Trim()
$asesor    = (SQL "SELECT COALESCE(col.nombre,'sin asesor') FROM lat_conversaciones c LEFT JOIN colaboradores col ON col.id = c.responsable_id WHERE c.id = '$convId';").Trim()
$cliente   = (SQL "SELECT COALESCE(cliente_nombre,'no identificado') FROM lat_conversaciones WHERE id = '$convId';").Trim()

Write-Host ""
Write-Host "  Cliente identificado : $cliente" -ForegroundColor White
Write-Host "  Estado conversacion  : $estado" -ForegroundColor White
Write-Host "  Estado bot           : $botEstado" -ForegroundColor White
Write-Host "  Turnos usados        : $turnos / 6" -ForegroundColor White
Write-Host "  Intencion detectada  : $intencion" -ForegroundColor Cyan
Write-Host "  Urgencia             : $urgencia" -ForegroundColor Cyan
Write-Host "  Resumen IA           : $resumen" -ForegroundColor Cyan
Write-Host "  Cola asignada        : $cola" -ForegroundColor Green
Write-Host "  Asesor asignado      : $asesor" -ForegroundColor Green

# ─── TODOS LOS MENSAJES ───────────────────────────────────────────────────────
STEP "HISTORIAL COMPLETO DE MENSAJES"
$allMsgs = SQL "SELECT tipo, contenido FROM lat_mensajes WHERE conversacion_id = '$convId' ORDER BY created_at;"
$allMsgs | ForEach-Object {
    if ($_ -match "^inbound") {
        $txt = ($_ -replace "^inbound\|", "")
        Write-Host "  [CLIENTE] $txt" -ForegroundColor White
    } elseif ($_ -match "^outbound") {
        $txt = ($_ -replace "^outbound\|", "")
        Write-Host "  [LATI]    $txt" -ForegroundColor Cyan
    }
}

# ─── RESULTADO ────────────────────────────────────────────────────────────────
Write-Host ""
if ($botEstado -eq "handed_off") {
    Write-Host "ENCOLAMIENTO EXITOSO - Lati identifico, detecto intencion y encolo" -ForegroundColor Green
} elseif ($botEstado -eq "activo") {
    Write-Host "BOT ACTIVO - Conversacion en curso" -ForegroundColor Yellow
} else {
    Write-Host "Estado: bot=$botEstado cola=$cola" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Studio local (ver DB): http://127.0.0.1:54323" -ForegroundColor DarkGray
Write-Host "  Bandeja LAT (ver conv): http://localhost:8080 o tu dev server" -ForegroundColor DarkGray

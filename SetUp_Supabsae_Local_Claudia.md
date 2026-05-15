# Setup Ambiente de Desarrollo Local — CRM Latidos

Seguí estos pasos en orden. Avisale a Roberto cuando termines cada sección.

---

## PASO 1 — Instalar Docker Desktop

1. Descargar desde https://www.docker.com/products/docker-desktop/ (versión Windows)
2. Instalar con estas opciones:
   - **All users installation** ✅
   - **Use WSL 2 instead of Hyper-V** ✅
   - **Allow Windows Containers** ❌ (sin tilde)
3. Reiniciar la PC al terminar
4. Abrir Docker Desktop → hacer click en **Skip** en la pantalla de login
5. Si aparece "WSL needs updating", abrir PowerShell como administrador y ejecutar:
   ```powershell
   wsl --update
   ```
   Luego hacer click en **Try Again** en Docker Desktop
6. Si aparece el firewall de Windows → click en **Permitir**
7. Verificar que Docker está corriendo (ícono de ballena en la barra de tareas sin animación)

---

## PASO 2 — Instalar Supabase CLI

Abrir **PowerShell como administrador** y ejecutar:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Verificar:
```powershell
supabase --version
```
Debe mostrar algo como `2.98.2`

---

## PASO 3 — Login a Supabase CLI

```powershell
supabase login
```

Se abre el browser. Iniciar sesión con la cuenta **estropical** (lprocesos@estropical.com).
Copiar el código que aparece en el browser y pegarlo en la terminal.
Debe decir **"Happy coding!"**

---

## PASO 4 — Clonar el repo y vincular Supabase

```powershell
cd "C:\Users\TU_USUARIO\Desktop"
git clone https://github.com/ramelunge-estropical/crm-latidos.git
cd crm-latidos
```

Luego vincular con el proyecto Supabase:
```powershell
supabase link --project-ref qadfjbgfdejmhblgvaef
```

Debe decir **"Finished supabase link."**

---

## PASO 5 — Bajar el schema de producción

```powershell
supabase db pull
```

Cuando pregunte `Update remote migration history table? [Y/n]` → escribir **Y** y Enter.

Esto crea el archivo `supabase/migrations/XXXXXX_remote_schema.sql` con el schema completo.

---

## PASO 6 — Levantar Supabase local

```powershell
supabase start
```

La primera vez tarda varios minutos (baja imágenes de Docker). Al terminar muestra URLs y keys locales. Guardar esa info.

Verificar abriendo en el browser: http://127.0.0.1:54323 (Studio local con todas las tablas)

---

## PASO 7 — Configurar .env.local

Crear el archivo `.env.local` en la raíz del proyecto con las keys que mostró el `supabase start`:

```env
VITE_SUPABASE_URL="http://127.0.0.1:54321"
VITE_SUPABASE_PUBLISHABLE_KEY="<Publishable key del supabase start>"
VITE_SUPABASE_PROJECT_ID="default"
```

> Este archivo NO se sube a git (ya está en .gitignore). Cada desarrollador tiene el suyo.

---

## PASO 8 — Crear tu branch de trabajo

Nunca trabajar directo en `main`. Crear tu branch personal:

```powershell
git checkout main
git pull origin main
git checkout -b feature/claudia
git push -u origin feature/claudia
```

Todo tu trabajo va en `feature/claudia`. Cuando algo esté listo para producción, abrís un Pull Request a `main` y Roberto lo revisa.

---

## Flujo de trabajo diario

```
1. git pull origin main          # traer cambios de Roberto
2. git checkout feature/claudia  # volver a tu branch
3. git merge main                # incorporar sus cambios
4. ... trabajar ...
5. git add <archivos>
6. git commit -m "descripcion"
7. git push origin feature/claudia
8. Cuando esté listo → abrir Pull Request en GitHub
```

---

## Comandos útiles de Supabase

```powershell
supabase start    # levantar local (correr una vez al día)
supabase stop     # apagar local (al terminar el día)
supabase status   # ver URLs y keys actuales
```

El Studio local está en: http://127.0.0.1:54323

---

## Ante cualquier duda → avisarle a Roberto

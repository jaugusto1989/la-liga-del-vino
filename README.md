# La Liga del Vino

Sistema de mostrador, stock y caja diaria. Etapa 1: ventas con lector de códigos, promociones, descuentos, bonificaciones, cuentas corrientes, tickets, caja con cierre ciego opcional, productos y perfiles de ganancia.

## Archivos
- `index.html`, `styles.css`, `app.js`: el sistema (sitio estático, sin compilación).
- `config.js`: URL y clave pública de Supabase.
- `supabase/00-esquema.sql`: base de datos completa (ya cargada).
- `listas.js`, `compras.js`: lector de listas (PDF/Excel), proveedores e ingreso de mercadería.
- `supabase/02-proveedores-y-compras.sql`: catálogo por proveedor e ingreso de mercadería.
- `supabase/01-aprobar-usuarios.sql`: ajuste de seguridad para que los usuarios nuevos necesiten aprobación del dueño. **Correrlo una vez en el SQL Editor.**

## Puesta en marcha
1. En Supabase, correr `supabase/01-aprobar-usuarios.sql` en el SQL Editor.
2. Subir esta carpeta a un repositorio de GitHub e importarlo en Vercel (Framework: *Other*, sin comando de build).
3. En Supabase > Authentication > URL Configuration, poner la dirección de Vercel como **Site URL** (para que el mail de confirmación lleve al sistema).
4. Entrar al sistema y crear tu cuenta: el primer usuario queda como **dueño**.
5. Los vendedores se crean su cuenta desde la pantalla de inicio y el dueño los habilita en Ajustes > Usuarios.

## Pendiente (próximas etapas)
- Contabilidad: gastos, compras y balance mensual.
- Modo sin conexión para el mostrador.
- Facturación electrónica ARCA.

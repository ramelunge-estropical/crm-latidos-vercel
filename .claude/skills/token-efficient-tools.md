# Token-Efficient Tools — Reglas obligatorias

**Esta skill debe aplicarse en TODA conversación de este proyecto.**

## Herramientas
- **Read**: siempre `offset`+`limit` — nunca leer archivo completo si sabés las líneas objetivo
- **Grep**: usar `files_with_matches` por defecto; `content` solo cuando necesitás el texto exacto; siempre `head_limit`
- **Edit**: old_string mínimo (solo lo necesario para ser único); nunca reescribir con Write si se puede editar
- **Bash**: encadenar con `&&`; nunca múltiples Bash secuenciales independientes — paralelizarlos
- **Agent/subagents**: solo para investigación genuinamente abierta; nunca delegar lo que podés resolver directo
- **Parallel**: siempre agrupar tool calls independientes en un solo mensaje

## Código
- No agregar comentarios, docstrings ni tipos a código que no tocaste
- No crear helpers/abstracciones para uso único
- No agregar manejo de errores para escenarios imposibles
- No leer archivos que no vas a modificar
- No re-leer después de un Edit/Write

## Respuestas
- Sin resúmenes al final ("Listo, hice X, Y, Z") — el usuario lee el diff
- Sin preámbulos ("Voy a proceder a...") — ejecutar directo
- Respuestas cortas; bullet points > párrafos
- No confirmar lo obvio

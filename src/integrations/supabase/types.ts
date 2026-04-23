export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          assigned_to: string | null
          assigned_to_id: string | null
          cliente_id: string | null
          cliente_nombre: string | null
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          gestion_id: string | null
          google_event_id: string | null
          id: string
          meet_link: string | null
          scheduled_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          assigned_to?: string | null
          assigned_to_id?: string | null
          cliente_id?: string | null
          cliente_nombre?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          gestion_id?: string | null
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          scheduled_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          assigned_to?: string | null
          assigned_to_id?: string | null
          cliente_id?: string | null
          cliente_nombre?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          gestion_id?: string | null
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          scheduled_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "gestiones"
            referencedColumns: ["id"]
          },
        ]
      }
      areas_empresa: {
        Row: {
          color: string
          created_at: string | null
          icono: string | null
          id: string
          nombre: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          icono?: string | null
          id?: string
          nombre: string
        }
        Update: {
          color?: string
          created_at?: string | null
          icono?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      chat_derivaciones: {
        Row: {
          capacidad_destino: number | null
          chats_abiertos_destino: number | null
          conversacion_id: string
          created_at: string
          derivado_por_id: string | null
          derivado_por_nombre: string | null
          destino_area_id: string | null
          destino_area_nombre: string | null
          destino_tipo: string
          destino_usuario_id: string | null
          destino_usuario_nombre: string | null
          efectivo_area_id: string | null
          efectivo_area_nombre: string | null
          efectivo_tipo: string
          efectivo_usuario_id: string | null
          efectivo_usuario_nombre: string | null
          hubo_fallback: boolean
          id: string
          motivo_fallback: string | null
          nota: string | null
          presencia_destino: string | null
        }
        Insert: {
          capacidad_destino?: number | null
          chats_abiertos_destino?: number | null
          conversacion_id: string
          created_at?: string
          derivado_por_id?: string | null
          derivado_por_nombre?: string | null
          destino_area_id?: string | null
          destino_area_nombre?: string | null
          destino_tipo: string
          destino_usuario_id?: string | null
          destino_usuario_nombre?: string | null
          efectivo_area_id?: string | null
          efectivo_area_nombre?: string | null
          efectivo_tipo: string
          efectivo_usuario_id?: string | null
          efectivo_usuario_nombre?: string | null
          hubo_fallback?: boolean
          id?: string
          motivo_fallback?: string | null
          nota?: string | null
          presencia_destino?: string | null
        }
        Update: {
          capacidad_destino?: number | null
          chats_abiertos_destino?: number | null
          conversacion_id?: string
          created_at?: string
          derivado_por_id?: string | null
          derivado_por_nombre?: string | null
          destino_area_id?: string | null
          destino_area_nombre?: string | null
          destino_tipo?: string
          destino_usuario_id?: string | null
          destino_usuario_nombre?: string | null
          efectivo_area_id?: string | null
          efectivo_area_nombre?: string | null
          efectivo_tipo?: string
          efectivo_usuario_id?: string | null
          efectivo_usuario_nombre?: string | null
          hubo_fallback?: boolean
          id?: string
          motivo_fallback?: string | null
          nota?: string | null
          presencia_destino?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_derivaciones_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "lat_conversaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_derivaciones_derivado_por_id_fkey"
            columns: ["derivado_por_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_derivaciones_destino_area_id_fkey"
            columns: ["destino_area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_derivaciones_destino_usuario_id_fkey"
            columns: ["destino_usuario_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_derivaciones_efectivo_area_id_fkey"
            columns: ["efectivo_area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_derivaciones_efectivo_usuario_id_fkey"
            columns: ["efectivo_usuario_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_bancos: {
        Row: {
          banco: string
          cliente_id: string
          created_at: string
          id: string
          observaciones: string | null
          tipo_cuenta: string | null
        }
        Insert: {
          banco: string
          cliente_id: string
          created_at?: string
          id?: string
          observaciones?: string | null
          tipo_cuenta?: string | null
        }
        Update: {
          banco?: string
          cliente_id?: string
          created_at?: string
          id?: string
          observaciones?: string | null
          tipo_cuenta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_bancos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_cobranzas: {
        Row: {
          cliente_id: string
          concepto: string
          created_at: string | null
          estado: string
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string
          moneda: string
          monto: number
          notas: string | null
        }
        Insert: {
          cliente_id: string
          concepto: string
          created_at?: string | null
          estado?: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
        }
        Update: {
          cliente_id?: string
          concepto?: string
          created_at?: string | null
          estado?: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_cobranzas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_documentos: {
        Row: {
          cliente_id: string
          created_at: string
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string
          numero: string | null
          observaciones: string | null
          pais_emisor: string | null
          tipo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          numero?: string | null
          observaciones?: string | null
          pais_emisor?: string | null
          tipo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          numero?: string | null
          observaciones?: string | null
          pais_emisor?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_familiar: {
        Row: {
          cliente_id: string
          created_at: string
          documento_numero: string | null
          familiar_cliente_id: string | null
          fecha_nacimiento: string | null
          id: string
          nombre: string
          observaciones: string | null
          relacion: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          documento_numero?: string | null
          familiar_cliente_id?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre: string
          observaciones?: string | null
          relacion: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          documento_numero?: string | null
          familiar_cliente_id?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          observaciones?: string | null
          relacion?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_familiar_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_familiar_familiar_cliente_id_fkey"
            columns: ["familiar_cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_ideas_viaje: {
        Row: {
          cliente_id: string
          created_at: string
          destino: string
          id: string
          notas: string | null
          prioridad: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          destino: string
          id?: string
          notas?: string | null
          prioridad?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          destino?: string
          id?: string
          notas?: string | null
          prioridad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_ideas_viaje_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_lealtad: {
        Row: {
          cliente_id: string
          created_at: string
          estado: string | null
          id: string
          millas_acumuladas: number | null
          nivel: string | null
          numero_membresia: string | null
          observaciones: string | null
          programa: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          estado?: string | null
          id?: string
          millas_acumuladas?: number | null
          nivel?: string | null
          numero_membresia?: string | null
          observaciones?: string | null
          programa: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          estado?: string | null
          id?: string
          millas_acumuladas?: number | null
          nivel?: string | null
          numero_membresia?: string | null
          observaciones?: string | null
          programa?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_lealtad_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_pagos: {
        Row: {
          cliente_id: string
          concepto: string | null
          created_at: string
          estado: string | null
          fecha: string | null
          id: string
          moneda: string | null
          monto: number
          referencia: string | null
          tipo: string
        }
        Insert: {
          cliente_id: string
          concepto?: string | null
          created_at?: string
          estado?: string | null
          fecha?: string | null
          id?: string
          moneda?: string | null
          monto: number
          referencia?: string | null
          tipo: string
        }
        Update: {
          cliente_id?: string
          concepto?: string | null
          created_at?: string
          estado?: string | null
          fecha?: string | null
          id?: string
          moneda?: string | null
          monto?: number
          referencia?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_pagos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_referidos: {
        Row: {
          cliente_id: string
          created_at: string
          fecha: string | null
          id: string
          observaciones: string | null
          referido_id: string | null
          referido_nombre: string | null
          tipo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          fecha?: string | null
          id?: string
          observaciones?: string | null
          referido_id?: string | null
          referido_nombre?: string | null
          tipo?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          fecha?: string | null
          id?: string
          observaciones?: string | null
          referido_id?: string | null
          referido_nombre?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_referidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_referidos_referido_id_fkey"
            columns: ["referido_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_viajes: {
        Row: {
          cliente_id: string
          created_at: string
          destino: string
          estado: string | null
          fecha_regreso: string | null
          fecha_salida: string | null
          id: string
          monto: number | null
          observaciones: string | null
          tipo_viaje: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          destino: string
          estado?: string | null
          fecha_regreso?: string | null
          fecha_salida?: string | null
          id?: string
          monto?: number | null
          observaciones?: string | null
          tipo_viaje?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          destino?: string
          estado?: string | null
          fecha_regreso?: string | null
          fecha_salida?: string | null
          id?: string
          monto?: number | null
          observaciones?: string | null
          tipo_viaje?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_viajes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          asesor_nombre: string | null
          canal_contacto: string | null
          ciudad: string | null
          club_viajes: boolean
          contacto_cargo: string | null
          contacto_nombre: string | null
          created_at: string
          dias_credito: number | null
          documento_numero: string | null
          documento_tipo: string | null
          email: string | null
          email_secundario: string | null
          espacio_a_bordo: boolean
          estado: string
          estado_civil: string | null
          facebook: string | null
          fecha_nacimiento: string | null
          id: string
          instagram: string | null
          nacionalidad: string | null
          nit: string | null
          nombre_completo: string
          notas_rapidas: string | null
          pais: string | null
          pases_a_bordo: number
          profesion: string | null
          razon_social: string | null
          score_etiqueta: string | null
          score_valor: number
          telefono: string | null
          telefono_secundario: string | null
          tiktok: string | null
          tipo_cliente: string
          updated_at: string
        }
        Insert: {
          asesor_nombre?: string | null
          canal_contacto?: string | null
          ciudad?: string | null
          club_viajes?: boolean
          contacto_cargo?: string | null
          contacto_nombre?: string | null
          created_at?: string
          dias_credito?: number | null
          documento_numero?: string | null
          documento_tipo?: string | null
          email?: string | null
          email_secundario?: string | null
          espacio_a_bordo?: boolean
          estado?: string
          estado_civil?: string | null
          facebook?: string | null
          fecha_nacimiento?: string | null
          id?: string
          instagram?: string | null
          nacionalidad?: string | null
          nit?: string | null
          nombre_completo: string
          notas_rapidas?: string | null
          pais?: string | null
          pases_a_bordo?: number
          profesion?: string | null
          razon_social?: string | null
          score_etiqueta?: string | null
          score_valor?: number
          telefono?: string | null
          telefono_secundario?: string | null
          tiktok?: string | null
          tipo_cliente?: string
          updated_at?: string
        }
        Update: {
          asesor_nombre?: string | null
          canal_contacto?: string | null
          ciudad?: string | null
          club_viajes?: boolean
          contacto_cargo?: string | null
          contacto_nombre?: string | null
          created_at?: string
          dias_credito?: number | null
          documento_numero?: string | null
          documento_tipo?: string | null
          email?: string | null
          email_secundario?: string | null
          espacio_a_bordo?: boolean
          estado?: string
          estado_civil?: string | null
          facebook?: string | null
          fecha_nacimiento?: string | null
          id?: string
          instagram?: string | null
          nacionalidad?: string | null
          nit?: string | null
          nombre_completo?: string
          notas_rapidas?: string | null
          pais?: string | null
          pases_a_bordo?: number
          profesion?: string | null
          razon_social?: string | null
          score_etiqueta?: string | null
          score_valor?: number
          telefono?: string | null
          telefono_secundario?: string | null
          tiktok?: string | null
          tipo_cliente?: string
          updated_at?: string
        }
        Relationships: []
      }
      colaborador_google_tokens: {
        Row: {
          access_token: string | null
          colaborador_id: string
          created_at: string | null
          google_email: string | null
          id: string
          refresh_token: string
          token_expiry: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          colaborador_id: string
          created_at?: string | null
          google_email?: string | null
          id?: string
          refresh_token: string
          token_expiry?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          colaborador_id?: string
          created_at?: string | null
          google_email?: string | null
          id?: string
          refresh_token?: string
          token_expiry?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_google_tokens_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_presencia: {
        Row: {
          capacidad_maxima: number
          chats_abiertos: number
          colaborador_id: string
          estado: string
          motivo_pausa: string | null
          ultima_actividad: string
          updated_at: string
        }
        Insert: {
          capacidad_maxima?: number
          chats_abiertos?: number
          colaborador_id: string
          estado?: string
          motivo_pausa?: string | null
          ultima_actividad?: string
          updated_at?: string
        }
        Update: {
          capacidad_maxima?: number
          chats_abiertos?: number
          colaborador_id?: string
          estado?: string
          motivo_pausa?: string | null
          ultima_actividad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_presencia_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          activo: boolean
          area_id: string | null
          cargo: string | null
          color: string
          created_at: string | null
          email: string | null
          id: string
          nombre: string
          rol: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          area_id?: string | null
          cargo?: string | null
          color?: string
          created_at?: string | null
          email?: string | null
          id?: string
          nombre: string
          rol?: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          area_id?: string | null
          cargo?: string | null
          color?: string
          created_at?: string | null
          email?: string | null
          id?: string
          nombre?: string
          rol?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      gestion_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          gestion_id: string
          id: string
          mime_type: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          gestion_id: string
          id?: string
          mime_type?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          gestion_id?: string
          id?: string
          mime_type?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gestion_attachments_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "gestiones"
            referencedColumns: ["id"]
          },
        ]
      }
      gestion_comments: {
        Row: {
          author_name: string | null
          comment_type: string
          content: string
          created_at: string
          gestion_id: string
          id: string
        }
        Insert: {
          author_name?: string | null
          comment_type?: string
          content: string
          created_at?: string
          gestion_id: string
          id?: string
        }
        Update: {
          author_name?: string | null
          comment_type?: string
          content?: string
          created_at?: string
          gestion_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gestion_comments_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "gestiones"
            referencedColumns: ["id"]
          },
        ]
      }
      gestion_conversation_events: {
        Row: {
          actor_name: string | null
          conversacion_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          gestion_id: string | null
          id: string
        }
        Insert: {
          actor_name?: string | null
          conversacion_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          gestion_id?: string | null
          id?: string
        }
        Update: {
          actor_name?: string | null
          conversacion_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          gestion_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gestion_conversation_events_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "lat_conversaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestion_conversation_events_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "gestiones"
            referencedColumns: ["id"]
          },
        ]
      }
      gestion_subtipos: {
        Row: {
          activo: boolean
          created_at: string | null
          id: string
          nombre: string
          orden: number
          tipo_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          id?: string
          nombre: string
          orden?: number
          tipo_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          id?: string
          nombre?: string
          orden?: number
          tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gestion_subtipos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "gestion_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      gestion_tareas: {
        Row: {
          asignado_a: string | null
          created_at: string | null
          descripcion: string | null
          estado: string
          fecha_limite: string | null
          gestion_id: string
          id: string
          orden: number | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          asignado_a?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string
          fecha_limite?: string | null
          gestion_id: string
          id?: string
          orden?: number | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          asignado_a?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string
          fecha_limite?: string | null
          gestion_id?: string
          id?: string
          orden?: number | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gestion_tareas_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "gestiones"
            referencedColumns: ["id"]
          },
        ]
      }
      gestion_tipos: {
        Row: {
          activo: boolean
          color: string
          created_at: string | null
          id: string
          nombre: string
          orden: number
          valor: string
        }
        Insert: {
          activo?: boolean
          color?: string
          created_at?: string | null
          id?: string
          nombre: string
          orden?: number
          valor: string
        }
        Update: {
          activo?: boolean
          color?: string
          created_at?: string | null
          id?: string
          nombre?: string
          orden?: number
          valor?: string
        }
        Relationships: []
      }
      gestiones: {
        Row: {
          area_id: string | null
          canal_origen: string | null
          cliente_id: string | null
          cliente_nombre: string | null
          codigo: string | null
          conversacion_id_origen: string | null
          created_at: string
          description: string | null
          due_date: string | null
          entered_stage_at: string
          id: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["gestion_priority"]
          process_id: string
          responsable_id: string | null
          responsable_nombre: string | null
          stage_id: string
          subtype: string | null
          title: string
          type: Database["public"]["Enums"]["gestion_type"]
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          canal_origen?: string | null
          cliente_id?: string | null
          cliente_nombre?: string | null
          codigo?: string | null
          conversacion_id_origen?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          entered_stage_at?: string
          id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["gestion_priority"]
          process_id: string
          responsable_id?: string | null
          responsable_nombre?: string | null
          stage_id: string
          subtype?: string | null
          title: string
          type?: Database["public"]["Enums"]["gestion_type"]
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          canal_origen?: string | null
          cliente_id?: string | null
          cliente_nombre?: string | null
          codigo?: string | null
          conversacion_id_origen?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          entered_stage_at?: string
          id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["gestion_priority"]
          process_id?: string
          responsable_id?: string | null
          responsable_nombre?: string | null
          stage_id?: string
          subtype?: string | null
          title?: string
          type?: Database["public"]["Enums"]["gestion_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gestiones_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_conversacion_id_origen_fkey"
            columns: ["conversacion_id_origen"]
            isOneToOne: false
            referencedRelation: "lat_conversaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lat_conversaciones: {
        Row: {
          asunto: string | null
          canal: string
          cliente_id: string | null
          cliente_nombre: string | null
          cola_area_id: string | null
          cola_area_nombre: string | null
          created_at: string | null
          en_cola: boolean
          en_foco: boolean
          estado: string
          gestion_id: string | null
          id: string
          no_leidos: number | null
          prioridad: string | null
          proxima_accion: string | null
          responsable_id: string | null
          responsable_nombre: string | null
          telefono: string | null
          ultima_interaccion: string | null
          ultimo_mensaje: string | null
          updated_at: string | null
          ventana_whatsapp: string | null
          wpp_contact_id: string | null
        }
        Insert: {
          asunto?: string | null
          canal?: string
          cliente_id?: string | null
          cliente_nombre?: string | null
          cola_area_id?: string | null
          cola_area_nombre?: string | null
          created_at?: string | null
          en_cola?: boolean
          en_foco?: boolean
          estado?: string
          gestion_id?: string | null
          id?: string
          no_leidos?: number | null
          prioridad?: string | null
          proxima_accion?: string | null
          responsable_id?: string | null
          responsable_nombre?: string | null
          telefono?: string | null
          ultima_interaccion?: string | null
          ultimo_mensaje?: string | null
          updated_at?: string | null
          ventana_whatsapp?: string | null
          wpp_contact_id?: string | null
        }
        Update: {
          asunto?: string | null
          canal?: string
          cliente_id?: string | null
          cliente_nombre?: string | null
          cola_area_id?: string | null
          cola_area_nombre?: string | null
          created_at?: string | null
          en_cola?: boolean
          en_foco?: boolean
          estado?: string
          gestion_id?: string | null
          id?: string
          no_leidos?: number | null
          prioridad?: string | null
          proxima_accion?: string | null
          responsable_id?: string | null
          responsable_nombre?: string | null
          telefono?: string | null
          ultima_interaccion?: string | null
          ultimo_mensaje?: string | null
          updated_at?: string | null
          ventana_whatsapp?: string | null
          wpp_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lat_conversaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lat_conversaciones_cola_area_id_fkey"
            columns: ["cola_area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lat_conversaciones_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "gestiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lat_conversaciones_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      lat_mensajes: {
        Row: {
          adjunto_nombre: string | null
          adjunto_tipo: string | null
          adjunto_url: string | null
          autor_nombre: string | null
          contenido: string
          conversacion_id: string
          created_at: string | null
          estado: string | null
          id: string
          tipo: string
          wpp_message_id: string | null
        }
        Insert: {
          adjunto_nombre?: string | null
          adjunto_tipo?: string | null
          adjunto_url?: string | null
          autor_nombre?: string | null
          contenido: string
          conversacion_id: string
          created_at?: string | null
          estado?: string | null
          id?: string
          tipo?: string
          wpp_message_id?: string | null
        }
        Update: {
          adjunto_nombre?: string | null
          adjunto_tipo?: string | null
          adjunto_url?: string | null
          autor_nombre?: string | null
          contenido?: string
          conversacion_id?: string
          created_at?: string | null
          estado?: string | null
          id?: string
          tipo?: string
          wpp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lat_mensajes_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "lat_conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          duracion_estimada_dias: number | null
          global_status: Database["public"]["Enums"]["global_status"]
          id: string
          name: string
          order: number
          process_id: string
          responsable_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duracion_estimada_dias?: number | null
          global_status?: Database["public"]["Enums"]["global_status"]
          id?: string
          name: string
          order?: number
          process_id: string
          responsable_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duracion_estimada_dias?: number | null
          global_status?: Database["public"]["Enums"]["global_status"]
          id?: string
          name?: string
          order?: number
          process_id?: string
          responsable_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      process_areas: {
        Row: {
          area_id: string
          process_id: string
        }
        Insert: {
          area_id: string
          process_id: string
        }
        Update: {
          area_id?: string
          process_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_areas_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      process_sub_areas: {
        Row: {
          process_id: string
          sub_area_id: string
        }
        Insert: {
          process_id: string
          sub_area_id: string
        }
        Update: {
          process_id?: string
          sub_area_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_sub_areas_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_sub_areas_sub_area_id_fkey"
            columns: ["sub_area_id"]
            isOneToOne: false
            referencedRelation: "sub_areas_empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          area: string | null
          area_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          area_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          area_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage_id: string | null
          gestion_id: string
          id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          gestion_id: string
          id?: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          gestion_id?: string
          id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_history_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "gestiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_rules: {
        Row: {
          applies_to_subtype: string | null
          applies_to_type: string | null
          created_at: string
          id: string
          rule_config: Json
          rule_type: string
          stage_id: string
        }
        Insert: {
          applies_to_subtype?: string | null
          applies_to_type?: string | null
          created_at?: string
          id?: string
          rule_config?: Json
          rule_type: string
          stage_id: string
        }
        Update: {
          applies_to_subtype?: string | null
          applies_to_type?: string | null
          created_at?: string
          id?: string
          rule_config?: Json
          rule_type?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_areas_empresa: {
        Row: {
          area_id: string
          color: string
          created_at: string | null
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          area_id: string
          color?: string
          created_at?: string | null
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          area_id?: string
          color?: string
          created_at?: string | null
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "sub_areas_empresa_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_empresa"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_type: "tarea" | "llamada" | "reunión"
      gestion_priority: "low" | "medium" | "high" | "urgent"
      gestion_type: "comercial" | "proyecto" | "operativa" | "caso"
      global_status: "to_do" | "doing" | "review" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: ["tarea", "llamada", "reunión"],
      gestion_priority: ["low", "medium", "high", "urgent"],
      gestion_type: ["comercial", "proyecto", "operativa", "caso"],
      global_status: ["to_do", "doing", "review", "done"],
    },
  },
} as const

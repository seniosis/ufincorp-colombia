import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { descripcion } = await req.json();

    if (!descripcion) {
      throw new Error("Missing descripcion");
    }

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user found");

    // First check user's custom rules
    const { data: rules } = await supabase
      .from("categorization_rules")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("priority", { ascending: false });

    if (rules && rules.length > 0) {
      const upperDesc = descripcion.toUpperCase();
      for (const rule of rules) {
        if (upperDesc.includes(rule.keyword.toUpperCase())) {
          return new Response(
            JSON.stringify({
              categoria: rule.categoria,
              contrapartida: rule.contrapartida || "UNKNOWN",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    // Use AI to classify if no rule matched
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Clasifica transacciones financieras en estas categorías:
- FULFILLMENT: fletes, envíos, logística
- REV_DROPI_COD: ingresos por ventas Dropi
- WITHDRAWALS: retiros de cartera
- ADS_FACEBOOK: publicidad Facebook/Meta
- SOFTWARE_TOOLS: herramientas como OpenAI, software
- INTERNAL_TRANSFER: transferencias entre cuentas propias
- INVENTORY: compra de inventario, proveedores
- OPERATIONAL: gastos operacionales
- OTHER: otros

Responde SOLO con JSON sin markdown:
{"categoria": "NOMBRE_CATEGORIA", "contrapartida": "NOMBRE_ENTIDAD", "confidence": 0.85}`
          },
          {
            role: "user",
            content: `Clasifica: ${descripcion}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI classification error:", response.status);
      return new Response(
        JSON.stringify({ categoria: "OTHER", contrapartida: "UNKNOWN" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const text = data.choices[0].message.content.trim();
    const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const result = JSON.parse(cleanJson);

    return new Response(
      JSON.stringify({
        categoria: result.categoria,
        contrapartida: result.contrapartida,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in classify-transaction:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        categoria: "OTHER",
        contrapartida: "UNKNOWN",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

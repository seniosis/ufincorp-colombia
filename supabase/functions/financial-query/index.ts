import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { question, userId } = await req.json();

    if (!question || !userId) {
      throw new Error("Missing required fields");
    }

    console.log(`Processing financial query: ${question}`);

    // Fetch user's transactions
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const transactionsResponse = await fetch(
      `${supabaseUrl}/rest/v1/transactions_unified?user_id=eq.${userId}&order=fecha.desc&limit=100`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!transactionsResponse.ok) {
      throw new Error("Failed to fetch transactions");
    }

    const transactions = await transactionsResponse.json();

    // Prepare context for AI
    const transactionsSummary = transactions
      .slice(0, 50)
      .map(
        (t: any) =>
          `Fecha: ${t.fecha}, Tipo: ${t.tipo}, Monto COP: ${t.monto_cop}, Categoría: ${t.categoria}, Cuenta: ${t.cuenta}, Descripción: ${t.descripcion}`
      )
      .join("\n");

    const systemPrompt = `Eres un asistente financiero experto especializado en analizar transacciones financieras de UFUN.

Reglas importantes:
1. SIEMPRE responde en español y en COP (pesos colombianos)
2. Formatea los números con separadores de miles: 1.234.567 COP
3. Sé preciso con los cálculos
4. Si necesitas filtrar por fecha, usa las fechas en formato YYYY-MM-DD
5. Categorías disponibles: REV_DROPI_COD (ingresos Dropi), FULFILLMENT (fletes), ADS_FACEBOOK, SOFTWARE_TOOLS, WITHDRAWALS, INTERNAL_TRANSFER, OTHER
6. Tipo de transacción: "in" = ingreso, "out" = egreso

Datos de transacciones del usuario (últimas 50):
${transactionsSummary}

Responde de manera profesional, clara y concisa.`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      
      if (aiResponse.status === 429) {
        throw new Error("Límite de consultas excedido. Por favor intenta más tarde.");
      }
      if (aiResponse.status === 402) {
        throw new Error("Créditos insuficientes. Por favor recarga tu cuenta.");
      }
      throw new Error("Error al procesar la consulta con IA");
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices?.[0]?.message?.content || "No pude generar una respuesta";

    console.log("AI response generated successfully");

    return new Response(
      JSON.stringify({
        answer,
        transactionsCount: transactions.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in financial-query:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

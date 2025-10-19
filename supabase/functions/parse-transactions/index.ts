import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface TransactionData {
  fecha: string;
  descripcion: string;
  monto_original: number;
  moneda: string;
  tipo: "in" | "out";
  categoria?: string;
  contrapartida?: string;
  referencia?: string;
}

const FX_RATES: Record<string, number> = {
  USD: 4100,
  AED: 1120,
  COP: 1,
};

function parseLine(line: string, separator: string): string[] {
  if (separator === ",") {
    // CSV parsing with quote handling
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === separator && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
  
  return line.split(separator).map(f => f.trim());
}

async function classifyTransaction(
  descripcion: string,
  userId: string,
  supabase: any
): Promise<{ categoria: string; contrapartida: string }> {
  // First check user's custom rules
  const { data: rules } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("priority", { ascending: false });

  if (rules && rules.length > 0) {
    const upperDesc = descripcion.toUpperCase();
    for (const rule of rules) {
      if (upperDesc.includes(rule.keyword.toUpperCase())) {
        return {
          categoria: rule.categoria,
          contrapartida: rule.contrapartida || "UNKNOWN",
        };
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

  if (response.ok) {
    const data = await response.json();
    const text = data.choices[0].message.content.trim();
    const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const result = JSON.parse(cleanJson);
    return { categoria: result.categoria, contrapartida: result.contrapartida };
  }

  return { categoria: "OTHER", contrapartida: "UNKNOWN" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, mapping, userId, cuenta } = await req.json();

    if (!fileContent || !mapping || !userId || !cuenta) {
      throw new Error("Missing required fields");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Parsing transactions with mapping:", mapping);

    const lines = fileContent.split("\n").filter((l: string) => l.trim());
    const startIndex = mapping.hasHeader ? 1 : 0;
    const transactions: TransactionData[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      try {
        const line = lines[i];
        if (!line.trim()) continue;

        const fields = parseLine(line, mapping.separator);
        const colMap = mapping.columnMapping;

        // Extract data based on mapping
        const fecha = fields[parseInt(Object.keys(colMap).find(k => colMap[k] === "fecha") || "0")] || new Date().toISOString().split("T")[0];
        const descripcion = fields[parseInt(Object.keys(colMap).find(k => colMap[k] === "descripcion") || "1")] || "Sin descripción";
        const montoStr = fields[parseInt(Object.keys(colMap).find(k => colMap[k] === "monto") || "2")] || "0";
        const moneda = fields[parseInt(Object.keys(colMap).find(k => colMap[k] === "moneda") || "-1")] || mapping.defaultCurrency || "COP";
        const tipoStr = fields[parseInt(Object.keys(colMap).find(k => colMap[k] === "tipo") || "-1")] || "";
        const referencia = fields[parseInt(Object.keys(colMap).find(k => colMap[k] === "referencia") || "-1")] || undefined;

        // Parse amount
        const montoOriginal = parseFloat(montoStr.replace(/[^0-9.-]/g, ""));
        if (isNaN(montoOriginal)) continue;

        // Determine type
        let tipo: "in" | "out" = montoOriginal > 0 ? "in" : "out";
        if (tipoStr) {
          const tipoLower = tipoStr.toLowerCase();
          if (tipoLower.includes("in") || tipoLower.includes("ingreso") || tipoLower.includes("credito")) {
            tipo = "in";
          } else if (tipoLower.includes("out") || tipoLower.includes("egreso") || tipoLower.includes("debito")) {
            tipo = "out";
          }
        }

        // Classify
        const classification = await classifyTransaction(descripcion, userId, supabase);

        transactions.push({
          fecha,
          descripcion,
          monto_original: Math.abs(montoOriginal),
          moneda,
          tipo,
          categoria: classification.categoria,
          contrapartida: classification.contrapartida,
          referencia,
        });

      } catch (error) {
        console.error(`Error parsing line ${i}:`, error);
      }
    }

    console.log(`Parsed ${transactions.length} transactions`);

    return new Response(
      JSON.stringify({
        success: true,
        transactions,
        count: transactions.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in parse-transactions:", error);
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

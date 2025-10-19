import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface TransactionData {
  fecha: string;
  descripcion: string;
  cuenta: string;
  tipo: "in" | "out";
  monto_original: number;
  moneda: string;
  monto_cop: number;
  categoria?: string;
  contrapartida?: string;
  referencia?: string;
  notas?: string;
  confidence?: number;
  reason?: string;
  user_id: string;
}

const CLASSIFICATION_RULES = {
  "COBRO DE FLETE": { categoria: "FULFILLMENT", contrapartida: "COORDINADORA" },
  "ENTRADA POR GANANCIA": { categoria: "REV_DROPI_COD", contrapartida: "DROPI_PLATFORM" },
  "RETIRO DE SALDO": { categoria: "WITHDRAWALS", contrapartida: "DROPICARTERA" },
  "CONSO": { categoria: "WITHDRAWALS", contrapartida: "DROPICARTERA" },
  "FACEBOOK": { categoria: "ADS_FACEBOOK", contrapartida: "FACEBOOK" },
  "META": { categoria: "ADS_FACEBOOK", contrapartida: "FACEBOOK" },
  "OPENAI": { categoria: "SOFTWARE_TOOLS", contrapartida: "OPENAI" },
  "CHATGPT": { categoria: "SOFTWARE_TOOLS", contrapartida: "OPENAI" },
  "TRANSFERENCIA DE WALLET": { categoria: "INTERNAL_TRANSFER", contrapartida: "SELF" },
  "MERCURY": { categoria: "INTERNAL_TRANSFER", contrapartida: "MERCURY" },
  "SLASH": { categoria: "INTERNAL_TRANSFER", contrapartida: "SLASH" },
};

const FX_RATES: Record<string, number> = {
  USD: 4100,
  AED: 1120,
  COP: 1,
};

function classifyTransaction(descripcion: string) {
  const upperDesc = descripcion.toUpperCase();
  for (const [keyword, classification] of Object.entries(CLASSIFICATION_RULES)) {
    if (upperDesc.includes(keyword)) {
      return classification;
    }
  }
  return { categoria: "OTHER", contrapartida: "UNKNOWN" };
}

function parseCSVLine(line: string): string[] {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function normalizeTransaction(
  rawData: any,
  cuenta: string,
  userId: string
): Promise<TransactionData> {
  const classification = classifyTransaction(rawData.descripcion || "");
  
  const moneda = rawData.moneda || "COP";
  const montoOriginal = parseFloat(rawData.monto_original || rawData.monto || "0");
  const rate = FX_RATES[moneda] || 1;
  const montoCOP = montoOriginal * rate;

  return {
    fecha: rawData.fecha || new Date().toISOString().split("T")[0],
    descripcion: rawData.descripcion || "Sin descripción",
    cuenta,
    tipo: rawData.tipo || (montoCOP > 0 ? "in" : "out"),
    monto_original: Math.abs(montoOriginal),
    moneda,
    monto_cop: Math.abs(montoCOP),
    categoria: classification.categoria,
    contrapartida: classification.contrapartida,
    referencia: rawData.referencia || undefined,
    notas: moneda !== "COP" ? `FX: ${moneda} → COP @ ${rate}` : undefined,
    confidence: 0.85,
    reason: `Auto-classified based on keyword matching`,
    user_id: userId,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, cuenta, userId } = await req.json();

    if (!fileContent || !cuenta || !userId) {
      throw new Error("Missing required fields");
    }

    console.log(`Processing file: ${fileName} for account: ${cuenta}`);

    const transactions: TransactionData[] = [];
    const lines = fileContent.split("\n").filter((l: string) => l.trim());

    // Skip header if CSV
    const startIndex = fileName.toLowerCase().endsWith(".csv") ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      try {
        const line = lines[i];
        if (!line.trim()) continue;

        let rawData: any = {};

        if (fileName.toLowerCase().endsWith(".csv")) {
          const fields = parseCSVLine(line);
          // Assume CSV format: fecha,descripcion,monto,moneda,tipo
          rawData = {
            fecha: fields[0],
            descripcion: fields[1],
            monto_original: fields[2],
            moneda: fields[3] || "COP",
            tipo: fields[4] || "in",
          };
        } else {
          // Try to parse as JSON for other formats
          try {
            rawData = JSON.parse(line);
          } catch {
            // Skip unparseable lines
            continue;
          }
        }

        const normalized = await normalizeTransaction(rawData, cuenta, userId);
        transactions.push(normalized);
      } catch (error) {
        console.error(`Error processing line ${i}:`, error);
        // Continue with next line
      }
    }

    // Insert transactions into database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/transactions_unified`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(transactions),
    });

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error("Database insert error:", errorText);
      throw new Error(`Failed to insert transactions: ${errorText}`);
    }

    console.log(`Successfully inserted ${transactions.length} transactions`);

    return new Response(
      JSON.stringify({
        success: true,
        count: transactions.length,
        message: `${transactions.length} transacciones procesadas exitosamente`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in process-transactions:", error);
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

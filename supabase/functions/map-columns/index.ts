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
    const { fileContent, fileName } = await req.json();

    if (!fileContent) {
      throw new Error("Missing file content");
    }

    console.log(`Analyzing file structure: ${fileName}`);

    const isPDF = fileName.toLowerCase().endsWith('.pdf');
    
    // For PDFs, take more content and extract transactions directly
    // For CSV/TSV, take first few lines to detect format
    const lines = fileContent.split("\n");
    const sampleData = isPDF 
      ? lines.slice(0, 100).join("\n")  // More lines for PDF analysis
      : lines.slice(0, 5).join("\n");   // Less for CSV format detection

    // Use AI to detect columns and map them
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
            content: isPDF 
              ? `Eres un experto en análisis de extractos bancarios PDF.
Tu tarea es extraer TODAS las transacciones del extracto bancario.

Responde SOLO con un objeto JSON válido sin markdown:
{
  "detectedFormat": "pdf",
  "transactions": [
    {
      "fecha": "2025-09-15",
      "descripcion": "Descripción completa de la transacción",
      "monto_original": 150000.50,
      "moneda": "COP",
      "tipo": "in" o "out",
      "referencia": "número de referencia si existe"
    }
  ],
  "defaultCurrency": "COP",
  "confidence": 0.9
}

IMPORTANTE:
- Extrae TODAS las transacciones que encuentres
- El tipo debe ser "in" para ingresos/créditos o "out" para egresos/débitos
- Convierte fechas a formato YYYY-MM-DD
- Limpia los montos de símbolos y deja solo números`
              : `Eres un experto en análisis de extractos bancarios y archivos CSV/TSV. 
Tu tarea es identificar qué columnas están presentes y mapearlas a este esquema:
- fecha: fecha de la transacción
- descripcion: descripción del movimiento
- monto: monto de la transacción
- moneda: moneda (COP, USD, AED, etc.)
- tipo: tipo de movimiento (in/out, ingreso/egreso)
- referencia: número de referencia (opcional)

Responde SOLO con un objeto JSON válido sin markdown:
{
  "detectedFormat": "csv" o "tsv" o "pipe-separated",
  "separator": "," o "\\t" o "|",
  "hasHeader": true/false,
  "columnMapping": {
    "0": "fecha",
    "1": "descripcion",
    "2": "monto"
  },
  "defaultCurrency": "COP",
  "confidence": 0.85
}`
          },
          {
            role: "user",
            content: isPDF
              ? `Extrae todas las transacciones de este extracto bancario PDF:\n\n${sampleData}`
              : `Analiza este extracto y mapea las columnas:\n\n${sampleData}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", errorText);
      
      // Handle rate limiting
      if (response.status === 429) {
        throw new Error("Límite de solicitudes excedido. Por favor, intenta de nuevo en unos momentos.");
      }
      if (response.status === 402) {
        throw new Error("Créditos agotados. Por favor, agrega fondos a tu cuenta.");
      }
      
      throw new Error("Error al analizar la estructura del archivo");
    }

    const aiData = await response.json();
    const mappingText = aiData.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    const cleanJson = mappingText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const mapping = JSON.parse(cleanJson);

    console.log("Detected mapping:", mapping);

    return new Response(
      JSON.stringify({ success: true, mapping }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in map-columns:", error);
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

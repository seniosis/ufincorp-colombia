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

    // Get first few lines to analyze
    const lines = fileContent.split("\n").slice(0, 5);
    const sampleData = lines.join("\n");

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
            content: `Eres un experto en análisis de extractos bancarios y archivos financieros. 
Tu tarea es identificar qué columnas están presentes en el archivo y mapearlas a este esquema estándar:
- fecha: fecha de la transacción
- descripcion: descripción del movimiento
- monto: monto de la transacción (puede ser monto_original, valor, amount, etc.)
- moneda: moneda (COP, USD, AED, etc.) - si no está presente, asume COP
- tipo: tipo de movimiento (in/out, ingreso/egreso, credito/debito, etc.)
- referencia: número de referencia, guía, orden (opcional)

Responde SOLO con un objeto JSON válido sin markdown, con esta estructura:
{
  "detectedFormat": "csv" o "tsv" o "pipe-separated",
  "separator": "," o "\\t" o "|",
  "hasHeader": true/false,
  "columnMapping": {
    "0": "fecha",
    "1": "descripcion",
    "2": "monto",
    ...
  },
  "defaultCurrency": "COP",
  "confidence": 0.85
}`
          },
          {
            role: "user",
            content: `Analiza este extracto y mapea las columnas:\n\n${sampleData}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", errorText);
      throw new Error("Failed to analyze file structure");
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

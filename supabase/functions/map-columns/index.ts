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
    
    // For PDFs, take much more content to ensure we get the transactions table
    // For CSV/TSV, take first few lines to detect format
    const lines = fileContent.split("\n");
    const sampleData = isPDF 
      ? lines.slice(0, 300).join("\n")  // Much more lines for PDF analysis to capture full transaction tables
      : lines.slice(0, 5).join("\n");   // Less for CSV format detection

    console.log(`Analyzing ${isPDF ? 'PDF' : 'CSV/TSV'} file with ${lines.length} total lines, using ${isPDF ? 300 : 5} lines for analysis`);

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
              ? `Eres un experto en análisis de extractos bancarios PDF. Tu tarea es extraer TODAS las transacciones.

BUSCA tablas con estos encabezados comunes:
- Date/Fecha, Description/Descripción, Amount/Monto, Balance/Saldo
- Ref Number/Referencia, Transaction/Transacción
- Débito/Crédito, Ingreso/Egreso

REGLAS IMPORTANTES:
1. Montos negativos o en columna de débitos = tipo "out"
2. Montos positivos o en columna de créditos = tipo "in"
3. Fechas: convierte a formato YYYY-MM-DD (ej: 06/09/2025 → 2025-09-06)
4. Montos: elimina símbolos de moneda, comas, espacios. Solo números y punto decimal
5. Si ves "USD to AED" o conversiones, el monto es la cantidad recibida (tipo "in")

Responde SOLO con JSON válido (sin markdown):
{
  "detectedFormat": "pdf",
  "transactions": [
    {
      "fecha": "2025-09-06",
      "descripcion": "To Andres Felipe Florez Villegas",
      "monto_original": 14600,
      "moneda": "AED",
      "tipo": "out",
      "referencia": "P157389908"
    }
  ],
  "defaultCurrency": "AED",
  "confidence": 0.9
}

Si NO encuentras transacciones, retorna:
{
  "detectedFormat": "pdf",
  "transactions": [],
  "defaultCurrency": "USD",
  "confidence": 0.1
}`
              : `Eres un experto en análisis de extractos bancarios CSV/TSV.
Identifica las columnas y mapéalas a: fecha, descripcion, monto, moneda, tipo, referencia

Responde SOLO con JSON válido (sin markdown):
{
  "detectedFormat": "csv",
  "separator": ",",
  "hasHeader": true,
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
              ? `Analiza este extracto bancario PDF y extrae TODAS las transacciones de las tablas:\n\n${sampleData}`
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
    
    console.log("Raw AI response:", mappingText.substring(0, 500));
    
    // Remove markdown code blocks if present
    const cleanJson = mappingText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const mapping = JSON.parse(cleanJson);

    console.log("Detected mapping:", JSON.stringify(mapping, null, 2));
    
    // Validate PDF extraction
    if (isPDF) {
      if (!mapping.transactions || !Array.isArray(mapping.transactions)) {
        console.error("PDF parsing failed: no transactions array in response");
        throw new Error("No se pudieron extraer transacciones del PDF. El formato podría no ser compatible.");
      }
      
      if (mapping.transactions.length === 0) {
        console.error("PDF parsing failed: empty transactions array");
        throw new Error("No se encontraron transacciones en el PDF. Verifica que el archivo contenga un extracto bancario con tabla de movimientos.");
      }
      
      console.log(`Successfully extracted ${mapping.transactions.length} transactions from PDF`);
    }

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

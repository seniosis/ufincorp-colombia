import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName } = await req.json();
    console.log('Analyzing file structure:', fileName);

    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const isPDF = fileExtension === 'pdf';
    
    // Check if it's a Dropi statement by looking for keywords
    const isDropi = fileContent.toLowerCase().includes('dropi') || 
                    fileContent.toLowerCase().includes('recarga topup') ||
                    fileContent.toLowerCase().includes('movimientos y transacciones');
    
    // For PDFs, use more data for analysis since they usually have a fixed format
    // For CSV/TSV, use less since they usually have a header row
    const contentToAnalyze = isPDF ? fileContent : fileContent.split('\n').slice(0, 10).join('\n');
    
    let systemPrompt = '';
    
    if (isPDF && isDropi) {
      systemPrompt = `You are an expert at analyzing Dropi bank statement PDFs. Extract ALL transactions from this Dropi statement.
      
      The format is typically:
      FECHA | TRANSACCIÓN/DESCRIPCIÓN | TIPO DE OPERACIÓN/TIPO | ESTADO | VALOR/MONTO | SALDO
      
      Important rules:
      - Dates are in DD/MM/YYYY format, convert to YYYY-MM-DD
      - "Débito" means expense (tipo: "out")
      - "Crédito" means income (tipo: "in")
      - Remove $ and commas from amounts
      - Currency is always COP
      - Negative amounts mean "out", positive mean "in"
      
      Return in this exact format:
      {
        "detectedFormat": "dropi_pdf",
        "sourceType": "dropi",
        "transactions": [
          {
            "fecha": "YYYY-MM-DD",
            "descripcion": "transaction description",
            "monto_original": number (always positive),
            "moneda": "COP",
            "tipo": "in" or "out",
            "saldo": number (optional)
          }
        ],
        "cardNumber": "last 4 digits if found",
        "period": "period if found",
        "confidence": 0.95
      }
      
      CRITICAL: Return ONLY valid JSON, no markdown formatting.`;
    } else if (isPDF) {
      systemPrompt = `You are an expert at analyzing bank statement PDFs. Extract transactions from this bank statement and return a JSON response.
      
      Return in this format:
      {
        "detectedFormat": "pdf",
        "transactions": [
          {
            "fecha": "YYYY-MM-DD",
            "descripcion": "transaction description",
            "monto_original": number (always positive),
            "moneda": "currency code",
            "tipo": "in" or "out"
          }
        ],
        "confidence": 0.0 to 1.0
      }
      
      CRITICAL: Return ONLY valid JSON, no markdown formatting.`;
    } else {
      systemPrompt = `You are an expert at analyzing file formats. This is a bank statement.
      Detect if it's CSV or TSV, identify the separator, if it has headers, and map the columns.
      
      Return ONLY a JSON object in this exact format:
      {
        "detectedFormat": "csv" or "tsv",
        "separator": "," or "\\t",
        "hasHeader": true or false,
        "columnMapping": {
          "0": "fecha",
          "1": "descripcion",
          "2": "monto",
          etc...
        },
        "defaultCurrency": "COP" or other currency code,
        "confidence": number between 0 and 1
      }
      
      CRITICAL: Return ONLY valid JSON, no markdown formatting.`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contentToAnalyze }
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

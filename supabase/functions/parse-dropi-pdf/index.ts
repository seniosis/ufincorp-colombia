import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deterministic parser for Dropi PDFs - NO AI, pure regex parsing
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName } = await req.json();
    console.log('Parsing Dropi PDF deterministically:', fileName);

    // Check if it's a Dropi statement
    const isDropi = fileContent.toLowerCase().includes('dropi') || 
                    fileContent.toLowerCase().includes('recarga topup') ||
                    fileContent.toLowerCase().includes('movimientos y transacciones');
    
    if (!isDropi) {
      throw new Error("Este no parece ser un extracto de Dropi");
    }

    // Extract card number if present
    let cardNumber = "";
    const cardMatch = fileContent.match(/\*{4}\s*\*{4}\s*\*{4}\s*(\d{4})/);
    if (cardMatch) {
      cardNumber = cardMatch[1];
      console.log('Found card number:', cardNumber);
    }

    // Extract period if present
    let period = "";
    const periodMatch = fileContent.match(/Periodo:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
    if (periodMatch) {
      period = `${periodMatch[1]} - ${periodMatch[2]}`;
      console.log('Found period:', period);
    }

    // Parse transactions using deterministic regex patterns
    const transactions = [];
    
    // Pattern for Dropi transaction lines:
    // DD/MM/YYYY | Description | Débito/Crédito | Estado | -$amount or $amount | $balance
    const transactionPattern = /(\d{2}\/\d{2}\/\d{4})\s+([^\|]+?)\s+(Débito|Crédito)\s+(Aprobada|Rechazada|Pendiente)\s+(-?\$[\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)/gi;
    
    let match;
    while ((match = transactionPattern.exec(fileContent)) !== null) {
      const [_, dateStr, description, tipoOperacion, estado, valorStr, saldoStr] = match;
      
      // Parse date: DD/MM/YYYY to YYYY-MM-DD
      const [day, month, year] = dateStr.split('/');
      const fecha = `${year}-${month}-${day}`;
      
      // Parse amount: remove $ and commas, get absolute value
      const cleanValor = valorStr.replace(/[$,]/g, '');
      const monto_original = Math.abs(parseFloat(cleanValor));
      
      // Determine transaction type
      const tipo = (tipoOperacion === 'Crédito' || !cleanValor.startsWith('-')) ? 'in' : 'out';
      
      // Parse balance
      const saldo = parseFloat(saldoStr.replace(/,/g, ''));
      
      transactions.push({
        fecha,
        descripcion: description.trim(),
        monto_original,
        moneda: "COP",
        tipo,
        saldo,
        estado
      });
    }

    console.log(`Extracted ${transactions.length} transactions deterministically`);
    
    if (transactions.length === 0) {
      throw new Error("No se encontraron transacciones en el formato esperado de Dropi");
    }

    // Log first and last transaction for verification
    console.log('First transaction:', JSON.stringify(transactions[0]));
    console.log('Last transaction:', JSON.stringify(transactions[transactions.length - 1]));

    return new Response(
      JSON.stringify({
        success: true,
        mapping: {
          detectedFormat: "dropi_pdf",
          sourceType: "dropi",
          transactions,
          cardNumber,
          period,
          confidence: 1.0,
          method: "deterministic_regex"
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in parse-dropi-pdf:", error);
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

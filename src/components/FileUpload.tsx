import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2 } from "lucide-react";
import { TransactionPreview } from "./TransactionPreview";

interface ParsedTransaction {
  fecha: string;
  descripcion: string;
  monto_original: number;
  moneda: string;
  tipo: "in" | "out";
  categoria?: string;
  contrapartida?: string;
  referencia?: string;
}

export const FileUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[] | null>(null);
  const { toast } = useToast();

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("activa", true)
        .order("nombre");

      if (error) throw error;
      return data;
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !accountId) {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo y una cuenta",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      // Read file as text
      const text = await file.text();

      // Step 1: Map columns using AI (with timeout)
      toast({
        title: "Analizando archivo...",
        description: "Esto puede tomar hasta 30 segundos para PDFs grandes",
      });

      const { data: mappingData, error: mappingError } = await supabase.functions.invoke("map-columns", {
        body: {
          fileContent: text,
          fileName: file.name,
        },
      });

      if (mappingError) {
        console.error("Mapping error:", mappingError);
        throw new Error(mappingError.message || "Error al analizar el formato del archivo");
      }

      console.log("Mapping detected:", mappingData.mapping);

      let parsedTransactions: ParsedTransaction[];

      // For PDFs or Dropi, AI already extracted transactions directly
      if ((mappingData.mapping.detectedFormat === "pdf" || mappingData.mapping.detectedFormat === "dropi_pdf") && mappingData.mapping.transactions) {
        console.log(`PDF: ${mappingData.mapping.transactions.length} transactions extracted directly`);
        
        if (mappingData.mapping.transactions.length === 0) {
          throw new Error("No se detectaron transacciones en el PDF. Por favor verifica que el archivo contenga un extracto bancario válido.");
        }

        toast({
          title: "Clasificando transacciones...",
          description: `Procesando ${mappingData.mapping.transactions.length} transacciones`,
        });

        // Classify each transaction
        const classificationsPromises = mappingData.mapping.transactions.map(async (tx: any) => {
          const { data, error } = await supabase.functions.invoke("classify-transaction", {
            body: {
              descripcion: tx.descripcion,
            },
          });
          
          if (error) {
            console.error("Classification error:", error);
            return { categoria: "OTHER", contrapartida: "UNKNOWN" };
          }
          
          return data;
        });
        
        const classifications = await Promise.all(classificationsPromises);
        
        parsedTransactions = mappingData.mapping.transactions.map((tx: any, i: number) => ({
          ...tx,
          categoria: classifications[i].categoria,
          contrapartida: classifications[i].contrapartida,
        }));
      } else {
        // For CSV/TSV, parse with mapping
        toast({
          title: "Procesando transacciones...",
          description: "Analizando y clasificando cada transacción",
        });

        const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-transactions", {
          body: {
            fileContent: text,
            mapping: mappingData.mapping,
            userId: user.user.id,
            accountId: accountId,
          },
        });

        if (parseError) {
          console.error("Parse error:", parseError);
          throw new Error(parseError.message || "Error al procesar las transacciones");
        }
        
        if (!parseData.transactions || parseData.transactions.length === 0) {
          throw new Error("No se detectaron transacciones. Verifica que el archivo tenga el formato correcto.");
        }

        parsedTransactions = parseData.transactions;
      }

      // Show preview for user to review
      setParsedTransactions(parsedTransactions);

      toast({
        title: "Archivo analizado",
        description: `${parsedTransactions.length} transacciones detectadas. Revísalas antes de guardar.`,
      });

    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Error al procesar archivo",
        description: error.message || "Ha ocurrido un error al procesar el archivo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    setParsedTransactions(null);
    setFile(null);
    setAccountId("");
  };

  const handleCancel = () => {
    setParsedTransactions(null);
  };

  if (parsedTransactions && accountId) {
    return (
      <TransactionPreview
        transactions={parsedTransactions}
        accountId={accountId}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar Transacciones</CardTitle>
        <CardDescription>
          Sube archivos CSV o PDF de tus extractos bancarios para procesarlos automáticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="account">Cuenta de Destino</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="account">
              <SelectValue placeholder="Selecciona una cuenta" />
            </SelectTrigger>
            <SelectContent>
              {accounts && accounts.length > 0 ? (
                accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.nombre} ({account.moneda}) - {account.tipo}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  No hay cuentas disponibles. Crea una cuenta primero.
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="file">Archivo</Label>
          <Input
            id="file"
            type="file"
            accept=".csv,.pdf"
            onChange={handleFileChange}
            disabled={loading}
          />
          {file && (
            <p className="text-sm text-muted-foreground">
              Archivo seleccionado: {file.name}
            </p>
          )}
        </div>

        <Button
          onClick={handleUpload}
          disabled={!file || !accountId || loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Procesar Archivo
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

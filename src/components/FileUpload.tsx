import { useState } from "react";
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
  const [cuenta, setCuenta] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[] | null>(null);
  const { toast } = useToast();

  const cuentas = [
    "WIO_MAIN",
    "DROPI_CARTERA",
    "DROPI_WALLET_PROVEEDURIA",
    "DROPI_WALLET_TIENDA",
    "BANCOLOMBIA_UFUN",
    "SLASH_MAIN",
    "MERCURY_MAIN",
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !cuenta) {
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

      // Step 1: Map columns using AI
      const { data: mappingData, error: mappingError } = await supabase.functions.invoke("map-columns", {
        body: {
          fileContent: text,
          fileName: file.name,
        },
      });

      if (mappingError) throw mappingError;

      console.log("Mapping detected:", mappingData.mapping);

      // Step 2: Parse transactions with detected mapping
      const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-transactions", {
        body: {
          fileContent: text,
          mapping: mappingData.mapping,
          userId: user.user.id,
          cuenta,
        },
      });

      if (parseError) throw parseError;

      // Show preview for user to review
      setParsedTransactions(parseData.transactions);

      toast({
        title: "Archivo analizado",
        description: `${parseData.count} transacciones detectadas. Revísalas antes de guardar.`,
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
    setCuenta("");
  };

  const handleCancel = () => {
    setParsedTransactions(null);
  };

  if (parsedTransactions) {
    return (
      <TransactionPreview
        transactions={parsedTransactions}
        cuenta={cuenta}
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
          <Label htmlFor="cuenta">Cuenta Origen</Label>
          <Select value={cuenta} onValueChange={setCuenta}>
            <SelectTrigger id="cuenta">
              <SelectValue placeholder="Selecciona una cuenta" />
            </SelectTrigger>
            <SelectContent>
              {cuentas.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
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
          disabled={!file || !cuenta || loading}
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

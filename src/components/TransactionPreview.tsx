import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, Edit2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface Transaction {
  fecha: string;
  descripcion: string;
  monto_original: number;
  moneda: string;
  tipo: "in" | "out";
  categoria?: string;
  contrapartida?: string;
  referencia?: string;
}

interface TransactionPreviewProps {
  transactions: Transaction[];
  accountId: string;
  onComplete: () => void;
  onCancel: () => void;
}

const CATEGORIAS = [
  "FULFILLMENT",
  "REV_DROPI_COD",
  "WITHDRAWALS",
  "ADS_FACEBOOK",
  "SOFTWARE_TOOLS",
  "INTERNAL_TRANSFER",
  "INVENTORY",
  "OPERATIONAL",
  "OTHER",
];

export const TransactionPreview = ({ transactions, accountId, onComplete, onCancel }: TransactionPreviewProps) => {
  const [editedTransactions, setEditedTransactions] = useState(transactions);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const FX_RATES: Record<string, number> = {
    USD: 4100,
    AED: 1120,
    COP: 1,
  };

  const handleEdit = (index: number, field: string, value: any) => {
    const updated = [...editedTransactions];
    updated[index] = { ...updated[index], [field]: value };
    setEditedTransactions(updated);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      // Get account name for backward compatibility
      const { data: account } = await supabase
        .from("accounts")
        .select("nombre")
        .eq("id", accountId)
        .single();

      // Convert and prepare for DB
      const dbTransactions = editedTransactions.map(t => ({
        fecha: t.fecha,
        descripcion: t.descripcion,
        cuenta: account?.nombre || "Unknown",
        account_id: accountId,
        tipo: t.tipo,
        monto_original: t.monto_original,
        moneda: t.moneda,
        monto_cop: t.monto_original * (FX_RATES[t.moneda] || 1),
        categoria: t.categoria || "OTHER",
        contrapartida: t.contrapartida || "UNKNOWN",
        referencia: t.referencia || undefined,
        notas: t.moneda !== "COP" ? `FX: ${t.moneda} → COP @ ${FX_RATES[t.moneda]}` : undefined,
        confidence: 0.85,
        reason: "Manual review and approval",
        user_id: user.user.id,
      }));

      const { error } = await supabase
        .from("transactions_unified")
        .insert(dbTransactions);

      if (error) throw error;

      toast({
        title: "¡Transacciones guardadas!",
        description: `${dbTransactions.length} transacciones importadas exitosamente`,
      });

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      
      onComplete();
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (index: number) => {
    setEditedTransactions(editedTransactions.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista Previa de Transacciones</CardTitle>
        <CardDescription>
          Revisa y edita las transacciones antes de guardarlas. {editedTransactions.length} transacciones detectadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Contrapartida</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editedTransactions.map((tx, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        type="date"
                        value={tx.fecha}
                        onChange={(e) => handleEdit(idx, "fecha", e.target.value)}
                        className="w-32"
                      />
                    ) : (
                      tx.fecha
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        value={tx.descripcion}
                        onChange={(e) => handleEdit(idx, "descripcion", e.target.value)}
                      />
                    ) : (
                      <span className="text-sm">{tx.descripcion}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        type="number"
                        value={tx.monto_original}
                        onChange={(e) => handleEdit(idx, "monto_original", parseFloat(e.target.value))}
                        className="w-24"
                      />
                    ) : (
                      `${tx.monto_original.toLocaleString()} ${tx.moneda}`
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Select
                        value={tx.tipo}
                        onValueChange={(v) => handleEdit(idx, "tipo", v)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">IN</SelectItem>
                          <SelectItem value="out">OUT</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={tx.tipo === "in" ? "text-success" : "text-destructive"}>
                        {tx.tipo.toUpperCase()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Select
                        value={tx.categoria}
                        onValueChange={(v) => handleEdit(idx, "categoria", v)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs font-mono">{tx.categoria}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        value={tx.contrapartida || ""}
                        onChange={(e) => handleEdit(idx, "contrapartida", e.target.value)}
                        className="w-32"
                      />
                    ) : (
                      <span className="text-xs">{tx.contrapartida}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {editingIndex === idx ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingIndex(null)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingIndex(idx)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemove(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || editedTransactions.length === 0}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Guardar {editedTransactions.length} Transacciones
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

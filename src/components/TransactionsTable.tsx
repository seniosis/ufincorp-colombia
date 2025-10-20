import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDownCircle, ArrowUpCircle, Trash2, Download, Search, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const TransactionsTable = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterCuenta, setFilterCuenta] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      const { data, error } = await supabase
        .from("transactions_unified")
        .select("*")
        .eq("user_id", user.user.id)
        .order("fecha", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions_unified")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast({
        title: "Transacción eliminada",
        description: "La transacción ha sido eliminada exitosamente",
      });
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la transacción",
        variant: "destructive",
      });
    },
  });

  const filteredTransactions = transactions?.filter((t) => {
    const matchesSearch = 
      t.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.contrapartida?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.referencia?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategoria = filterCategoria === "all" || t.categoria === filterCategoria;
    const matchesTipo = filterTipo === "all" || t.tipo === filterTipo;
    const matchesCuenta = filterCuenta === "all" || t.cuenta === filterCuenta;

    return matchesSearch && matchesCategoria && matchesTipo && matchesCuenta;
  });

  const uniqueCategories = Array.from(new Set(transactions?.map(t => t.categoria).filter(Boolean)));
  const uniqueCuentas = Array.from(new Set(transactions?.map(t => t.cuenta)));

  const exportToCSV = () => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      toast({
        title: "Sin datos",
        description: "No hay transacciones para exportar",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Fecha", "Descripción", "Cuenta", "Categoría", "Contrapartida", "Tipo", "Monto Original", "Moneda", "Monto COP"];
    const csvContent = [
      headers.join(","),
      ...filteredTransactions.map(t => [
        t.fecha,
        `"${t.descripcion.replace(/"/g, '""')}"`,
        t.cuenta,
        t.categoria || "",
        t.contrapartida || "",
        t.tipo,
        t.monto_original,
        t.moneda,
        t.monto_cop
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `transacciones_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportación exitosa",
      description: `${filteredTransactions.length} transacciones exportadas`,
    });
  };

  const formatCOP = (amount: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getCategoryColor = (categoria: string) => {
    const colors: Record<string, string> = {
      REV_DROPI_COD: "bg-success-light text-success",
      FULFILLMENT: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      ADS_FACEBOOK: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
      SOFTWARE_TOOLS: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
      WITHDRAWALS: "bg-destructive-light text-destructive",
      INTERNAL_TRANSFER: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
      OTHER: "bg-muted text-muted-foreground",
    };
    return colors[categoria] || colors.OTHER;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transacciones Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transacciones</CardTitle>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="in">Ingresos</SelectItem>
                <SelectItem value="out">Egresos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCuenta} onValueChange={setFilterCuenta}>
              <SelectTrigger>
                <SelectValue placeholder="Cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas</SelectItem>
                {uniqueCuentas.map((cuenta) => (
                  <SelectItem key={cuenta} value={cuenta}>{cuenta}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger>
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat || ""}>{cat || "Sin categoría"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground mb-3">
            Mostrando {filteredTransactions?.length || 0} de {transactions?.length || 0} transacciones
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Monto COP</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions?.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">
                      {format(new Date(transaction.fecha), "dd MMM yy", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {transaction.tipo === "in" ? (
                          <ArrowUpCircle className="w-4 h-4 text-success" />
                        ) : (
                          <ArrowDownCircle className="w-4 h-4 text-destructive" />
                        )}
                        <div className="flex flex-col">
                          <span className="truncate max-w-[300px]">{transaction.descripcion}</span>
                          {transaction.contrapartida && (
                            <span className="text-xs text-muted-foreground">{transaction.contrapartida}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{transaction.cuenta}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(transaction.categoria || "OTHER")}>
                        {transaction.categoria || "OTHER"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right financial-number font-semibold">
                      {formatCOP(Number(transaction.monto_cop))}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(transaction.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredTransactions?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {transactions?.length === 0 
                        ? "No hay transacciones aún. Sube tu primer archivo para comenzar."
                        : "No se encontraron transacciones con los filtros aplicados."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar transacción?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. La transacción será eliminada permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

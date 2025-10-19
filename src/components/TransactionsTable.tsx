import { useQuery } from "@tanstack/react-query";
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
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";

export const TransactionsTable = () => {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      const { data, error } = await supabase
        .from("transactions_unified")
        .select("*")
        .eq("user_id", user.user.id)
        .order("fecha", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

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
    <Card>
      <CardHeader>
        <CardTitle>Transacciones Recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Monto COP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions?.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    {format(new Date(transaction.fecha), "dd MMM", { locale: es })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {transaction.tipo === "in" ? (
                        <ArrowUpCircle className="w-4 h-4 text-success" />
                      ) : (
                        <ArrowDownCircle className="w-4 h-4 text-destructive" />
                      )}
                      <span className="truncate max-w-[300px]">{transaction.descripcion}</span>
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
                </TableRow>
              ))}
              {transactions?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No hay transacciones aún. Sube tu primer archivo para comenzar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
